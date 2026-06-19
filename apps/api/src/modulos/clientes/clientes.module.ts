import { Module } from "@nestjs/common";
import { AuthModule } from "../../auth/auth.module.js";
import { ClientesController } from "./clientes.controller.js";
import { ClientesService } from "./clientes.service.js";

@Module({
  imports: [AuthModule],
  controllers: [ClientesController],
  providers: [ClientesService],
})
export class ClientesModule {}
