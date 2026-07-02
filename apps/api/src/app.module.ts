import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { ScheduleModule } from "@nestjs/schedule";
import { ThrottlerModule } from "@nestjs/throttler";
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
import { DevolucionesProveedorModule } from "./modulos/devoluciones-proveedor/devoluciones-proveedor.module.js";
import { TransferenciasCodigoModule } from "./modulos/transferencias-codigo/transferencias-codigo.module.js";
import { ParametrosModule } from "./modulos/parametros/parametros.module.js";
import { PedidosModule } from "./modulos/pedidos/pedidos.module.js";
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
    // Rate limiting. NO se registra ThrottlerGuard como APP_GUARD global a
    // proposito: solo AuthController lo aplica (ver @UseGuards ahi). Este default
    // laxo (20 req/min por IP) cubre las rutas del controller que no fijan un
    // limite propio (p. ej. si en el futuro se agregan endpoints de auth).
    ThrottlerModule.forRoot([
      { name: "default", ttl: 60_000, limit: 20 },
    ]),
    // Habilita @Cron para las tareas programadas (purga de tokens obsoletos).
    ScheduleModule.forRoot(),
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
    DevolucionesProveedorModule,
    TransferenciasCodigoModule,
    ParametrosModule,
    PedidosModule,
    FamiliasModule,
    AuditoriaModule,
    ExportModule,
    DashboardModule,
  ],
})
export class AppModule {}
