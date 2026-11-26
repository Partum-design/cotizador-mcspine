// Modelo principal configurable; si Google no lo reconoce se usa el de respaldo.
const MODELS = [
  process.env.GEMINI_MODEL || "gemini-3.1-flash-lite",
  "gemini-2.5-flash-lite",
].filter((model, index, list) => model && list.indexOf(model) === index);
const MAX_PROMPT_LENGTH = 1200;

import { PRODUCTS, CATEGORY_LABEL } from "../src/products.js";

const CATEGORIES = [...Object.values(CATEGORY_LABEL), "Instrumental y servicios"];
const SLUGS = PRODUCTS.map((product) => product.slug);
const CATALOG_TEXT = PRODUCTS.map(
  (product) => `- ${product.slug}: ${product.name}${product.brand ? ` de ${product.brand}` : ""} (${CATEGORY_LABEL[product.category]})`,
).join("\n");
const findProduct = (slug) => PRODUCTS.find((product) => product.slug === slug);

const serviceSchema = {
  type: "object",
  properties: {
    message: {
      type: "string",
      description: "Confirmación breve en español, sin saludo ni texto promocional.",
    },
    services: {
      type: "array",
      minItems: 1,
      maxItems: 8,
      items: {
        type: "object",
        properties: {
          slug: {
            type: "string",
            description: "Slug del producto del catálogo MC Spine; usa \"ninguno\" si no corresponde a un producto del catálogo.",
          },
          category: {
            type: "string",
            enum: CATEGORIES,
          },
          name: {
            type: "string",
            description: "Nombre del producto o concepto.",
          },
          description: {
            type: "string",
            description: "Descripción breve en una sola oración.",
          },
          zone: {
            type: "string",
            description: "Cervical, Toracolumbar, Lumbar o Por definir.",
          },
          presentation: {
            type: "string",
            description: "Pieza, Sistema, Kit, Caja, Servicio o Por definir.",
          },
          quantity: {
            type: "integer",
            minimum: 1,
            maximum: 999,
          },
          price: {
            type: "number",
            minimum: 0,
            description: "Precio unitario sin IVA. Usa 0 si el usuario no dio un precio.",
          },
          reference: {
            type: "string",
            description: "Referencia o código indicado; cadena vacía si no se indicó.",
          },
        },
        required: [
          "slug",
          "category",
          "name",
          "description",
          "zone",
          "presentation",
          "quantity",
          "price",
          "reference",
        ],
      },
    },
  },
  required: ["message", "services"],
};

const safeText = (value, fallback, maxLength = 240) => {
  const text = String(value ?? "").trim();
  return (text || fallback).slice(0, maxLength);
};

function sanitizeService(service) {
  const product = SLUGS.includes(service.slug) ? findProduct(service.slug) : null;
  const category = product
    ? CATEGORY_LABEL[product.category]
    : CATEGORIES.includes(service.category)
      ? service.category
      : "Instrumental y servicios";
  return {
    slug: product?.slug || "",
    category,
    name: product?.name || safeText(service.name, "Concepto por definir", 120),
    description: product?.desc || safeText(service.description, "Descripción por definir.", 320),
    zone: safeText(service.zone, "Por definir", 60),
    presentation: safeText(service.presentation, "Por definir", 60),
    quantity: Math.min(999, Math.max(1, Math.round(Number(service.quantity) || 1))),
    price: Math.max(0, Number(service.price) || 0),
    reference: safeText(service.reference, "", 60),
  };
}

export default async function handler(request, response) {
  response.setHeader("Cache-Control", "no-store");

  if (request.method !== "POST") {
    response.setHeader("Allow", "POST");
    return response.status(405).json({ error: "Método no permitido." });
  }

  // Acepta GOOGLE_API_KEY (nombre usado en el proyecto principal de Partum) o GEMINI_API_KEY.
  const apiKey = (process.env.GOOGLE_API_KEY || process.env.GEMINI_API_KEY || "").trim();
  if (
    !apiKey ||
    apiKey === "undefined" ||
    apiKey.startsWith("pega_aqui_")
  ) {
    return response.status(503).json({
      error: "NORA aún no tiene configurada la variable GOOGLE_API_KEY.",
      code: "KEY_NOT_CONFIGURED",
    });
  }

  const prompt = String(request.body?.prompt ?? "").trim();
  const currency = request.body?.currency === "USD" ? "USD" : "MXN";

  if (prompt.length < 8) {
    return response.status(400).json({
      error: "Describe los productos con un poco más de detalle.",
    });
  }

  if (prompt.length > MAX_PROMPT_LENGTH) {
    return response.status(400).json({
      error: `El dictado debe tener menos de ${MAX_PROMPT_LENGTH} caracteres.`,
    });
  }

  const instruction = [
    "Eres NORA, asistente de cotizaciones de MC Spine, comercializadora de implantes y material para cirugía de columna.",
    "Convierte exclusivamente el texto del usuario en uno o varios conceptos de cotización.",
    "Si un concepto corresponde a un producto del catálogo, usa su slug exacto; si no, usa \"ninguno\" y la categoría Instrumental y servicios.",
    `Catálogo:\n${CATALOG_TEXT}`,
    `La moneda de la cotización es ${currency}.`,
    "No inventes precios, zonas, presentaciones ni referencias: usa los valores de respaldo definidos en el esquema.",
    "El precio siempre es unitario, numérico y sin IVA.",
    "No agregues explicaciones fuera del JSON.",
    `Texto del usuario: ${prompt}`,
  ].join("\n");

  try {
    let geminiResponse;
    for (const model of MODELS) {
      geminiResponse = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-goog-api-key": apiKey,
          },
          body: JSON.stringify({
            contents: [{ parts: [{ text: instruction }] }],
            generationConfig: {
              temperature: 0.1,
              maxOutputTokens: 1400,
              responseMimeType: "application/json",
              responseSchema: serviceSchema,
              // Sin razonamiento extendido: respuesta más rápida.
              thinkingConfig: model.startsWith("gemini-2")
                ? { thinkingBudget: 0 }
                : { thinkingLevel: "minimal" },
            },
          }),
          signal: AbortSignal.timeout(20_000),
        },
      );
      // 404 = modelo no disponible para esta clave; probar el siguiente.
      if (geminiResponse.status !== 404) break;
      console.warn(`Gemini model ${model} not available, trying fallback`);
    }

    const payload = await geminiResponse.json();

    if (!geminiResponse.ok) {
      console.error("Gemini API error", geminiResponse.status, payload?.error?.message);
      return response.status(geminiResponse.status === 429 ? 429 : 502).json({
        error:
          geminiResponse.status === 429
            ? "NORA llegó al límite temporal. Intenta nuevamente en un momento."
            : "NORA no pudo interpretar la solicitud en este momento.",
      });
    }

    const text = payload?.candidates?.[0]?.content?.parts
      ?.map((part) => part.text || "")
      .join("");
    const result = JSON.parse(text);
    const services = Array.isArray(result.services)
      ? result.services.slice(0, 8).map(sanitizeService)
      : [];

    if (!services.length) {
      throw new Error("Gemini returned no services");
    }

    return response.status(200).json({
      message: safeText(result.message, `${services.length} concepto(s) listo(s).`, 140),
      services,
    });
  } catch (error) {
    console.error("NORA request failed", error);
    return response.status(502).json({
      error: "NORA no pudo completar la solicitud. Revisa la conexión e intenta otra vez.",
    });
  }
}
