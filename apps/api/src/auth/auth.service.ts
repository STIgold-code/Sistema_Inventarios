import { Injectable, UnauthorizedException } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import * as bcrypt from "bcrypt";
import { PrismaService } from "../comun/prisma/prisma.service.js";

interface PayloadToken {
  sub: string; // usuarioId
  empresaId: string;
  email: string;
}

export interface ResultadoLogin {
  token: string;
  usuario: {
    id: string;
    empresaId: string;
    email: string;
    nombre: string;
    permisos: string[];
  };
}

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
  ) {}

  async login(email: string, clave: string): Promise<ResultadoLogin> {
    const usuario = await this.prisma.usuario.findFirst({
      where: { email, activo: true },
      include: {
        roles: { include: { rol: { include: { permisos: { include: { permiso: true } } } } } },
      },
    });

    if (!usuario || !(await bcrypt.compare(clave, usuario.hashClave))) {
      throw new UnauthorizedException("Credenciales invalidas");
    }

    const permisos = this.extraerPermisos(usuario.roles);
    const payload: PayloadToken = {
      sub: usuario.id.toString(),
      empresaId: usuario.empresaId.toString(),
      email: usuario.email,
    };

    return {
      token: await this.jwt.signAsync(payload),
      usuario: {
        id: usuario.id.toString(),
        empresaId: usuario.empresaId.toString(),
        email: usuario.email,
        nombre: usuario.nombre,
        permisos,
      },
    };
  }

  /** Carga el usuario y sus permisos a partir del id del token. */
  async cargarUsuario(usuarioId: bigint): Promise<{
    id: bigint;
    empresaId: bigint;
    email: string;
    nombre: string;
    permisos: string[];
  }> {
    const usuario = await this.prisma.usuario.findFirst({
      where: { id: usuarioId, activo: true },
      include: {
        roles: { include: { rol: { include: { permisos: { include: { permiso: true } } } } } },
      },
    });
    if (!usuario) {
      throw new UnauthorizedException("Usuario no valido");
    }
    return {
      id: usuario.id,
      empresaId: usuario.empresaId,
      email: usuario.email,
      nombre: usuario.nombre,
      permisos: this.extraerPermisos(usuario.roles),
    };
  }

  private extraerPermisos(
    roles: Array<{ rol: { permisos: Array<{ permiso: { codigo: string } }> } }>,
  ): string[] {
    const codigos = new Set<string>();
    for (const ur of roles) {
      for (const rp of ur.rol.permisos) {
        codigos.add(rp.permiso.codigo);
      }
    }
    return [...codigos];
  }
}
