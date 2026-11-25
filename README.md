# Cotizador MC Spine

Cotizador comercial de implantes y material para cirugía de columna de **MC Spine**, basado en el sistema del Cotizador PARTUM y con la identidad, logotipos y catálogo oficial del sitio de MC Spine.

## Funciones

- Catálogo MC Spine integrado (27 productos con imagen, categoría y zona anatómica): búsqueda, filtros y alta con un toque.
- Vista previa de la cotización en tiempo real, con imagen de cada producto.
- Conceptos editables, duplicables y reordenables (también conceptos libres: instrumental, servicios, etc.).
- Cálculo automático de subtotal, descuento, IVA y total.
- Datos del emisor, contacto y datos bancarios editables (los bancarios solo aparecen si se capturan).
- Sello ISO 9001:2015 en la hoja.
- Guardado local del borrador.
- Exportación A4 mediante la vista de impresión.
- NORA: generación asistida de conceptos con Gemini, reconoce los productos del catálogo.
- Dictado por voz en navegadores compatibles.

## Desarrollo

```bash
npm install
cp .env.example .env.local
npm run dev
```

Configura en `.env.local` (y en Vercel → Settings → Environment Variables):

```env
GEMINI_API_KEY=tu_clave_privada
```

La clave se usa únicamente en `/api/nora` y nunca se incluye en el código del navegador.

## Catálogo

Los productos viven en `src/products.js` y sus imágenes en `public/catalogo/`. Es el mismo formato que `assets/data/products.js` del sitio de MC Spine.
