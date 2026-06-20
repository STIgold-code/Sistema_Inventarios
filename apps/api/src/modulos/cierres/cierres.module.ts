import { Module } from "@nestjs/common";
import { AuthModule } from "../../auth/auth.module.js";
import { CierresController } from "./cierres.controller.js";
import { CierresService } from "./cierres.service.js";

@Module({
  imports: [AuthModule],
  controllers: [CierresController],
  providers: [CierresService],
})
export class CierresModule {}
