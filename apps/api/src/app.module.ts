import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { PrismaModule } from "./comun/prisma/prisma.module.js";
import { SaludModule } from "./salud/salud.module.js";
import { AuthModule } from "./auth/auth.module.js";
import { InventarioModule } from "./modulos/inventario/inventario.module.js";
import { ProductoModule } from "./modulos/productos/producto.module.js";
import { ComprasModule } from "./modulos/compras/compras.module.js";
import { VentasModule } from "./modulos/ventas/ventas.module.js";
import { ReportesModule } from "./modulos/reportes/reportes.module.js";
import { ActivosModule } from "./modulos/activos/activos.module.js";
import { ImportadorModule } from "./modulos/importador/importador.module.js";
import { TrasladosModule } from "./modulos/traslados/traslados.module.js";
import { AlmacenesModule } from "./modulos/almacenes/almacenes.module.js";

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
    VentasModule,
    ReportesModule,
    ActivosModule,
    ImportadorModule,
    TrasladosModule,
    AlmacenesModule,
  ],
})
export class AppModule {}
