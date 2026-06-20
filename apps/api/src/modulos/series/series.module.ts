import { Module } from "@nestjs/common";
import { AuthModule } from "../../auth/auth.module.js";
import { SeriesController } from "./series.controller.js";
import { SeriesService } from "./series.service.js";

@Module({
  imports: [AuthModule],
  controllers: [SeriesController],
  providers: [SeriesService],
})
export class SeriesModule {}
