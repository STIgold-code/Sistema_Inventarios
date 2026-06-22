# Validación funcional — Sistema de Inventarios BM vs. SISALM

**Objetivo:** confirmar con el equipo de BM Ingenieros (contabilidad y jefatura de almacén) qué funcionalidades del sistema anterior (SISALM) se usan realmente hoy, para priorizar el desarrollo. No todo lo que SISALM ofrecía sigue en uso.

**Cómo usar este documento:** en la sección 2, marca cada fila con **¿Se usa hoy? (Sí/No)** y una **prioridad (Alta/Media/Baja)**. Las dudas anótalas en Observaciones.

---

## 1. Lo que el sistema nuevo YA hace (equivalencias con SISALM)

| En SISALM lo llamabas… | En el sistema nuevo | Estado |
|---|---|---|
| Códigos de almacén (hasta 99) | Almacenes | ✅ Disponible |
| Maestro de artículos | Productos / SKU (catálogo) | ✅ Disponible |
| Stock disponible / comprometido | Existencias (disponible / comprometido) | ✅ Disponible |
| Kardex del almacén (valorizado) | Kardex valorizado (costo promedio) | ✅ Disponible |
| Maestro de proveedores | Proveedores | ✅ Disponible |
| Maestro de clientes | Clientes | ✅ Disponible |
| Centro de costo / Solicitante | Centro de costo / Solicitante (en vales) | ✅ Disponible |
| Registro de entradas (compra) | Compras: Orden de Compra + Recepción con factura | ✅ Disponible |
| Registro de salidas (consumo) | Vale de Salida / Hoja de Cargo | ✅ Disponible |
| Guía de remisión | Guía de Remisión (registro de referencia) | ✅ Disponible |
| Transferencia entre almacenes | Traslados (con tránsito) | ✅ Disponible |
| Ajuste / Regularización | Movimientos: Ajuste / Merma | ✅ Disponible |
| Numeración automática de documentos | Correlativos por documento | ✅ Disponible |
| Tipos de documento (Factura, Boleta, Guía, N/C) | Catálogo SUNAT (Tabla 10) | ✅ Disponible |
| Reporte de inventario valorizado | Reportes SUNAT (Formato 12.1 y 13.1, PLE) | ✅ Disponible |

> Nota: el sistema nuevo registra la **referencia** de los comprobantes (factura/boleta/guía). La **emisión electrónica** se hace en el facturador electrónico (OSE), no en este sistema. SISALM emitía comprobantes porque era anterior a la facturación electrónica.

---

## 2. Funcionalidades de SISALM por CONFIRMAR (¿se usan hoy?)

| # | Funcionalidad de SISALM | ¿Se usa hoy? | Prioridad | Observaciones |
|---|---|:---:|:---:|---|
| 1 | **Cierre mensual de valorización** (cerrar el mes y congelar saldos valorizados) | ☐ Sí / ☐ No | ☐ A/M/B | |
| 2 | **Kardex valorizado bimoneda** (soles y dólares a la vez) con tipo de cambio diario | ☐ Sí / ☐ No | ☐ A/M/B | |
| 3 | **Consumo por Orden de Trabajo** (salidas asociadas a una OT) | ☐ Sí / ☐ No | ☐ A/M/B | |
| 4 | **Reportes de consumo valorizado** por centro de costo / solicitante / orden de trabajo | ☐ Sí / ☐ No | ☐ A/M/B | |
| 5 | **Datos logísticos del artículo**: stock máximo, punto de reposición, semanas de reposición | ☐ Sí / ☐ No | ☐ A/M/B | |
| 6 | **Reporte de reposición de stock** (qué pedir y cuándo) | ☐ Sí / ☐ No | ☐ A/M/B | |
| 7 | **Clasificación ABC** del artículo y reporte por antigüedad de compra | ☐ Sí / ☐ No | ☐ A/M/B | |
| 8 | **Multi-unidad / factor de conversión** (comprar en cajas, consumir en unidades) | ☐ Sí / ☐ No | ☐ A/M/B | |
| 9 | **Cotizaciones por proveedor-artículo** (último precio por proveedor) | ☐ Sí / ☐ No | ☐ A/M/B | |
| 10 | **Asientos contables a CONCAR** (costo de ventas, consumo por centro de costo) | ☐ Sí / ☐ No | ☐ A/M/B | |
| 11 | **Reportes de rentabilidad** (precio de venta vs. costo) | ☐ Sí / ☐ No | ☐ A/M/B | |
| 12 | **Control por número de serie** (artefactos, motores, repuestos) | ☐ Sí / ☐ No | ☐ A/M/B | |
| 13 | **Devolución de guía de remisión** / facturar guía pendiente | ☐ Sí / ☐ No | ☐ A/M/B | |
| 14 | **Código de movimiento configurable** (definir tipos de entrada/salida con sus reglas) | ☐ Sí / ☐ No | ☐ A/M/B | |
| 15 | **Múltiples niveles de precio de venta** por cliente (público, distribuidor, etc.) | ☐ Sí / ☐ No | ☐ A/M/B | |

---

## 3. Preguntas abiertas para el equipo de BM

1. ¿Cuántos almacenes manejan hoy realmente (Soledad y cuáles más)?
2. ¿El contador necesita el cierre mensual valorizado en **dólares además de soles**, o solo soles?
3. ¿Las salidas a obra se controlan por **orden de trabajo**, por **centro de costo**, o por ambos?
4. ¿Qué reportes de SISALM imprimían o exportaban **todos los meses** (esos son los que importan)?
5. ¿Siguen integrando con **CONCAR** para la contabilidad, o cambiaron de sistema contable?
6. ¿Manejan artículos con **número de serie** (motores, herramientas) que necesiten trazabilidad individual?

---

*Documento preparado a partir del análisis del "Manual del Usuario SISALM — Versión Visual 6.x".*
