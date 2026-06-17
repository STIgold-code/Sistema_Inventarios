# Deploy a Railway

El sistema son **3 servicios** en un mismo proyecto de Railway:

1. **PostgreSQL** (plugin de Railway) — la base de datos
2. **API** (NestJS) — backend
3. **Web** (Next.js) — frontend

El repositorio es un monorepo pnpm, así que cada servicio instala desde la raíz y compila su parte con `--filter`.

---

## 1. Crear el proyecto y la base de datos

1. En [railway.app](https://railway.app) → **New Project** → **Deploy from GitHub repo** → elegí este repo.
2. Dentro del proyecto: **+ New** → **Database** → **PostgreSQL**. Railway genera la variable `DATABASE_URL`.

## 2. Servicio API

Creá un servicio desde el repo (o usá el que se creó al importar) y configurá:

- **Settings → Build Command:**
  ```
  corepack enable && pnpm install --frozen-lockfile && pnpm --filter @bm/tipos build && pnpm --filter @bm/contratos build && pnpm --filter @bm/api db:generate && pnpm --filter @bm/api build
  ```
- **Settings → Start Command:**
  ```
  pnpm --filter @bm/api start:prod
  ```
  (corre `prisma migrate deploy` y luego arranca; las migraciones se aplican solas en cada deploy)
- **Variables:**
  | Variable | Valor |
  |----------|-------|
  | `DATABASE_URL` | `${{Postgres.DATABASE_URL}}` (referencia al servicio Postgres) |
  | `JWT_SECRET` | un secreto largo y aleatorio (ej. `openssl rand -hex 32`) |
  | `JWT_EXPIRACION` | `8h` |
- **Settings → Networking → Generate Domain** para obtener la URL pública (ej. `bm-api-production.up.railway.app`).

## 3. Servicio Web

Creá otro servicio desde el mismo repo y configurá:

- **Build Command:**
  ```
  corepack enable && pnpm install --frozen-lockfile && pnpm --filter @bm/tipos build && pnpm --filter @bm/contratos build && pnpm --filter @bm/web build
  ```
- **Start Command:**
  ```
  pnpm --filter @bm/web start
  ```
- **Variables:**
  | Variable | Valor |
  |----------|-------|
  | `NEXT_PUBLIC_API_URL` | la URL pública de la **API** (paso 2), ej. `https://bm-api-production.up.railway.app` |

  > Importante: `NEXT_PUBLIC_API_URL` se embebe en tiempo de **build**. Si cambia la URL de la API, hay que **redeployar** el Web.
- **Generate Domain** para la URL pública del sistema.

## 4. Cargar los datos iniciales (una sola vez)

Después del primer deploy de la API (con las migraciones ya aplicadas), corré el seed desde tu terminal apuntando a la base de Railway:

```bash
# Conectado al proyecto de Railway (railway link)
railway run --service <API> pnpm --filter @bm/api db:seed:prod
railway run --service <API> pnpm --filter @bm/api db:seed:usuarios:prod
```

Esto crea: empresa BM, sucursal, almacén, 53 familias, unidades SUNAT, el admin y los usuarios del equipo.

Para importar los ~10k productos reales, usá la pantalla **Importador** del sistema ya desplegado, o el script `importar-excel.ts` con `railway run`.

## 5. Checklist post-deploy

- [ ] Reemplazar el RUC placeholder (`20100000001`) por el real de BM.
- [ ] Cambiar las contraseñas por defecto de los usuarios.
- [ ] Verificar que `NEXT_PUBLIC_API_URL` apunta a la API correcta.
- [ ] (Opcional) Configurar dominios personalizados.
