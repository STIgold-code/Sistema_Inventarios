import { Module } from "@nestjs/common";
import { AuthModule } from "../../auth/auth.module.js";
import { TransportistasController } from "./transportistas.controller.js";
import { TransportistasService } from "./transportistas.service.js";

@Module({
  imports: [AuthModule],
  controllers: [TransportistasController],
  providers: [TransportistasService],
})
export class TransportistasModule {}
