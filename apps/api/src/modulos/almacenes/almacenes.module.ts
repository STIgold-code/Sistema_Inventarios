import { Module } from "@nestjs/common";
import { AuthModule } from "../../auth/auth.module.js";
import { AlmacenesController } from "./almacenes.controller.js";
import { AlmacenesService } from "./almacenes.service.js";

@Module({
  imports: [AuthModule],
  controllers: [AlmacenesController],
  providers: [AlmacenesService],
})
export class AlmacenesModule {}
