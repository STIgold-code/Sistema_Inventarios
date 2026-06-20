"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import {
  ErrorApi,
  obtenerVale,
  type EstadoValeSalida,
  type ValeSalida,
} from "@/lib/api";
import { formatearFecha, formatearNumero } from "@/lib/formato";

const ETIQUETA_ESTADO: Record<EstadoValeSalida, string> = {
  BORRADOR: "Borrador",
  AUTORIZADO: "Autorizado",
  DESPACHADO: "Despachado",
  ANULADO: "Anulado",
};

/** Datos formales de la empresa para el encabezado del documento. */
const EMPRESA = {
  nombre: "BM INGENIEROS S.A.C.",
  detalle: "Vale de salida — hoja de cargo de materiales",
} as const;

export default function PaginaImprimirVale(): React.JSX.Element {
  const params = useParams<{ id: string }>();
  const id = Number(params.id);

  const [vale, setVale] = useState<ValeSalida | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [cargando, setCargando] = useState<boolean>(true);

  useEffect(() => {
    if (!Number.isInteger(id) || id <= 0) {
      setError("Identificador de vale no válido.");
      setCargando(false);
      return;
    }
    void (async (): Promise<void> => {
      try {
        setVale(await obtenerVale(id));
      } catch (e) {
        setError(
          e instanceof ErrorApi ? e.message : "No se pudo cargar el vale.",
        );
      } finally {
        setCargando(false);
      }
    })();
  }, [id]);

  if (cargando) {
    return <p className="estado-doc">Cargando documento…</p>;
  }

  if (error || !vale) {
    return (
      <p className="estado-doc estado-doc-error" role="alert">
        {error ?? "Vale no encontrado."}
      </p>
    );
  }

  return (
    <>
      <style jsx global>{`
        /* Oculta el cromo del panel (barra lateral, topbar) en pantalla y print. */
        aside,
        header {
          display: none !important;
        }
        main {
          padding: 0 !important;
          overflow: visible !important;
        }
        body {
          background: #fff;
        }
        @media print {
          .barra-acciones {
            display: none !important;
          }
          @page {
            size: A4;
            margin: 16mm;
          }
        }
      `}</style>

      <div className="documento">
        <div className="barra-acciones">
          <button
            type="button"
            onClick={() => window.print()}
            className="btn btn-primario"
          >
            Imprimir / Guardar PDF
          </button>
        </div>

        <article className="hoja">
          <header className="hoja-encabezado">
            <div>
              <p className="hoja-empresa">{EMPRESA.nombre}</p>
              <p className="hoja-empresa-detalle">{EMPRESA.detalle}</p>
            </div>
            <div className="hoja-folio">
              <p className="hoja-titulo">VALE DE SALIDA</p>
              <table className="hoja-meta">
                <tbody>
                  <tr>
                    <th>N°</th>
                    <td className="font-mono">{vale.numero}</td>
                  </tr>
                  <tr>
                    <th>Fecha</th>
                    <td>{formatearFecha(vale.fecha)}</td>
                  </tr>
                  <tr>
                    <th>Estado</th>
                    <td>{ETIQUETA_ESTADO[vale.estado]}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </header>

          <section className="hoja-datos">
            <div>
              <span className="hoja-rotulo">Almacén de origen</span>
              <span className="hoja-valor">{vale.almacen}</span>
            </div>
            <div>
              <span className="hoja-rotulo">Centro de costo</span>
              <span className="hoja-valor">{vale.centroCosto}</span>
            </div>
            <div>
              <span className="hoja-rotulo">Destino</span>
              <span className="hoja-valor">{vale.destino}</span>
            </div>
            <div>
              <span className="hoja-rotulo">Solicitante</span>
              <span className="hoja-valor">{vale.solicitante}</span>
            </div>
            {vale.ordenTrabajo && (
              <div>
                <span className="hoja-rotulo">Orden de trabajo</span>
                <span className="hoja-valor">{vale.ordenTrabajo}</span>
              </div>
            )}
            {vale.observaciones && (
              <div className="hoja-datos-completo">
                <span className="hoja-rotulo">Observaciones</span>
                <span className="hoja-valor">{vale.observaciones}</span>
              </div>
            )}
          </section>

          <table className="hoja-tabla">
            <thead>
              <tr>
                <th className="col-num">#</th>
                <th>Código</th>
                <th>Descripción</th>
                <th className="col-cant">Cantidad</th>
                <th>Observación</th>
              </tr>
            </thead>
            <tbody>
              {vale.lineas.map((linea, indice) => (
                <tr key={linea.id}>
                  <td className="col-num">{indice + 1}</td>
                  <td className="font-mono">{linea.codigoSku}</td>
                  <td>{linea.nombreSku}</td>
                  <td className="col-cant">{formatearNumero(linea.cantidad)}</td>
                  <td>{linea.observacion ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>

          <section className="hoja-firmas">
            <div className="hoja-firma">
              <div className="hoja-firma-linea" />
              <p className="hoja-firma-rol">Solicitante</p>
              <p className="hoja-firma-nombre">{vale.solicitante}</p>
            </div>
            <div className="hoja-firma">
              <div className="hoja-firma-linea" />
              <p className="hoja-firma-rol">Autoriza</p>
              <p className="hoja-firma-nombre">{vale.autorizadoPor ?? " "}</p>
            </div>
            <div className="hoja-firma">
              <div className="hoja-firma-linea" />
              <p className="hoja-firma-rol">Entrega</p>
              <p className="hoja-firma-nombre"> </p>
            </div>
            <div className="hoja-firma">
              <div className="hoja-firma-linea" />
              <p className="hoja-firma-rol">Recibe</p>
              <p className="hoja-firma-nombre"> </p>
            </div>
          </section>

          <footer className="hoja-pie">
            <span>{EMPRESA.nombre}</span>
            <span>
              Documento generado por el Sistema de Inventarios — {vale.numero}
            </span>
          </footer>
        </article>
      </div>

      <style jsx>{`
        .estado-doc {
          padding: 2rem;
          font-size: 0.9rem;
          color: #475569;
        }
        .estado-doc-error {
          color: #b91c1c;
        }
        .documento {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 1rem;
          padding: 1.5rem 1rem;
          background: #f1f5f9;
          min-height: 100vh;
        }
        .barra-acciones {
          width: 100%;
          max-width: 210mm;
          display: flex;
          justify-content: flex-end;
        }
        .hoja {
          width: 100%;
          max-width: 210mm;
          background: #fff;
          color: #0f172a;
          padding: 16mm;
          box-shadow: 0 1px 4px rgba(15, 23, 42, 0.12);
          font-size: 0.82rem;
          line-height: 1.45;
        }
        .hoja-encabezado {
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
          gap: 2rem;
          border-bottom: 2px solid #0f172a;
          padding-bottom: 0.85rem;
        }
        .hoja-empresa {
          font-size: 1.15rem;
          font-weight: 700;
          letter-spacing: 0.02em;
        }
        .hoja-empresa-detalle {
          margin-top: 0.15rem;
          color: #475569;
          font-size: 0.8rem;
        }
        .hoja-folio {
          text-align: right;
        }
        .hoja-titulo {
          font-weight: 700;
          font-size: 0.95rem;
          margin-bottom: 0.4rem;
        }
        .hoja-meta {
          margin-left: auto;
          border-collapse: collapse;
        }
        .hoja-meta th,
        .hoja-meta td {
          border: 1px solid #cbd5e1;
          padding: 0.18rem 0.55rem;
          font-size: 0.78rem;
          text-align: left;
        }
        .hoja-meta th {
          background: #f1f5f9;
          font-weight: 600;
        }
        .hoja-datos {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 0.5rem 2rem;
          margin: 1.1rem 0;
        }
        .hoja-datos-completo {
          grid-column: 1 / -1;
        }
        .hoja-rotulo {
          display: block;
          font-size: 0.68rem;
          text-transform: uppercase;
          letter-spacing: 0.04em;
          color: #64748b;
          font-weight: 600;
        }
        .hoja-valor {
          display: block;
          font-weight: 500;
        }
        .hoja-tabla {
          width: 100%;
          border-collapse: collapse;
          margin-bottom: 1.6rem;
        }
        .hoja-tabla th,
        .hoja-tabla td {
          border: 1px solid #cbd5e1;
          padding: 0.35rem 0.5rem;
          text-align: left;
          vertical-align: top;
        }
        .hoja-tabla thead th {
          background: #0f172a;
          color: #fff;
          font-weight: 600;
          font-size: 0.74rem;
          text-transform: uppercase;
          letter-spacing: 0.03em;
        }
        .col-num {
          width: 2.5rem;
          text-align: center;
        }
        .col-cant {
          width: 5.5rem;
          text-align: right;
        }
        .hoja-firmas {
          display: grid;
          grid-template-columns: repeat(4, 1fr);
          gap: 1.75rem;
          margin-top: 3.5rem;
        }
        .hoja-firma {
          text-align: center;
        }
        .hoja-firma-linea {
          border-top: 1px solid #0f172a;
          margin-bottom: 0.35rem;
        }
        .hoja-firma-rol {
          font-weight: 600;
          font-size: 0.8rem;
        }
        .hoja-firma-nombre {
          color: #475569;
          font-size: 0.78rem;
          min-height: 1.1rem;
        }
        .hoja-pie {
          margin-top: 2.5rem;
          padding-top: 0.6rem;
          border-top: 1px solid #cbd5e1;
          display: flex;
          justify-content: space-between;
          font-size: 0.68rem;
          color: #64748b;
        }
        .font-mono {
          font-family: var(--font-mono, ui-monospace, monospace);
        }
      `}</style>
    </>
  );
}
