import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { PrismaModule } from "./comun/prisma/prisma.module.js";
import { SaludModule } from "./salud/salud.module.js";
import { AuthModule } from "./auth/auth.module.js";
import { InventarioModule } from "./modulos/inventario/inventario.module.js";
import { ProductoModule } from "./modulos/productos/producto.module.js";
import { ComprasModule } from "./modulos/compras/compras.module.js";
import { ProveedoresModule } from "./modulos/proveedores/proveedores.module.js";
import { CotizacionesModule } from "./modulos/cotizaciones/cotizaciones.module.js";
import { VentasModule } from "./modulos/ventas/ventas.module.js";
import { ClientesModule } from "./modulos/clientes/clientes.module.js";
import { ReportesModule } from "./modulos/reportes/reportes.module.js";
import { ContabilidadModule } from "./modulos/contabilidad/contabilidad.module.js";
import { ActivosModule } from "./modulos/activos/activos.module.js";
import { ImportadorModule } from "./modulos/importador/importador.module.js";
import { TrasladosModule } from "./modulos/traslados/traslados.module.js";
import { AlmacenesModule } from "./modulos/almacenes/almacenes.module.js";
import { CentrosCostoModule } from "./modulos/centros-costo/centros-costo.module.js";
import { VendedoresModule } from "./modulos/vendedores/vendedores.module.js";
import { TransportistasModule } from "./modulos/transportistas/transportistas.module.js";
import { CorrelativoModule } from "./modulos/comun/correlativo/correlativo.module.js";
import { RequerimientosModule } from "./modulos/requerimientos/requerimientos.module.js";
import { ValesModule } from "./modulos/vales/vales.module.js";
import { GuiasModule } from "./modulos/guias/guias.module.js";
import { TiposCambioModule } from "./modulos/tipos-cambio/tipos-cambio.module.js";
import { CierresModule } from "./modulos/cierres/cierres.module.js";
import { OrdenesTrabajoModule } from "./modulos/ordenes-trabajo/ordenes-trabajo.module.js";
import { SeriesModule } from "./modulos/series/series.module.js";
import { DevolucionesModule } from "./modulos/devoluciones/devoluciones.module.js";
import { FamiliasModule } from "./modulos/familias/familias.module.js";
import { AuditoriaModule } from "./modulos/auditoria/auditoria.module.js";
import { ExportModule } from "./modulos/comun/export/export.module.js";
import { DashboardModule } from "./modulos/dashboard/dashboard.module.js";

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ["../../.env"],
    }),
    PrismaModule,
    SaludModule,
    AuthModule,
    ProductoModule,
    InventarioModule,
    ComprasModule,
    ProveedoresModule,
    CotizacionesModule,
    VentasModule,
    ClientesModule,
    ReportesModule,
    ContabilidadModule,
    ActivosModule,
    ImportadorModule,
    TrasladosModule,
    AlmacenesModule,
    CentrosCostoModule,
    VendedoresModule,
    TransportistasModule,
    CorrelativoModule,
    RequerimientosModule,
    ValesModule,
    GuiasModule,
    TiposCambioModule,
    CierresModule,
    OrdenesTrabajoModule,
    SeriesModule,
    DevolucionesModule,
    FamiliasModule,
    AuditoriaModule,
    ExportModule,
    DashboardModule,
  ],
})
export class AppModule {}
