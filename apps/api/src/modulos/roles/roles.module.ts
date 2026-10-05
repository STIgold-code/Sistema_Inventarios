import { Module } from "@nestjs/common";
import { AuthModule } from "../../auth/auth.module.js";
import { AuditoriaModule } from "../auditoria/auditoria.module.js";
import { PermisosController } from "./permisos.controller.js";
import { RolesController } from "./roles.controller.js";
import { RolesService } from "./roles.service.js";

@Module({
  imports: [AuthModule, AuditoriaModule],
  controllers: [RolesController, PermisosController],
  providers: [RolesService],
})
export class RolesModule {}
