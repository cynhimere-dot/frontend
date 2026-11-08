# XochilGest

Aplicación de gestión de tienda con frontend separado y API de backend conectada a MongoDB.

## Estructura

- `frontend/`: interfaz HTML, CSS y JavaScript.
- `backend/`: servidor HTTP, API y conexión a MongoDB.

## Ejecutar

Necesitas Node.js 20 o posterior y MongoDB en ejecución. Desde `backend`, instala la dependencia y configura la conexión:

```sh
npm install
Copy-Item .env.example .env
```

Para MongoDB local, los valores iniciales de `.env` sirven si el servicio escucha en `127.0.0.1:27017`. Después inicia el backend:

```sh
npm start
```

Abre [http://localhost:3000](http://localhost:3000). La API y el frontend se sirven desde el mismo servidor. Los documentos quedan en la base `xochilgest`, en las colecciones `users`, `products` y `sales`; puedes verlas en MongoDB Compass conectándote a la misma URI (`mongodb://127.0.0.1:27017`). Define `MONGODB_URI`, `MONGODB_DB` o `PORT` en `.env` para personalizar la conexión. No subas `.env` al repositorio.

## API principal

- `POST /api/auth/register`, `POST /api/auth/login`, `GET /api/auth/me`, `POST /api/auth/logout`
- `GET /api/store`
- `POST /api/products`, `PUT /api/products/:id`, `DELETE /api/products/:id`
- `POST /api/sales`
- `GET /api/health`

Las contraseñas se guardan como hashes scrypt con sal aleatoria; el token de sesión vive en memoria y se invalida al reiniciar el servidor. El diseño se adapta a móvil, tablet y escritorio; en pantallas pequeñas las tablas se desplazan horizontalmente.
