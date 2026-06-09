# EZY Dashboard

Plataforma de gestión de producción musical que usa **Google Drive como único backend** (archivos JSON para metadatos, carpetas para organización de archivos).

## 🚀 Tecnologías

- **Framework**: Next.js 16 (App Router)
- **Lenguaje**: TypeScript
- **Estilos**: Tailwind CSS v4
- **Autenticación**: Better Auth (Google OAuth)
- **Almacenamiento**: Google Drive API (`googleapis`)
- **Emails**: Resend
- **UI/UX**: Componentes premium, glassmorphism, modo oscuro por defecto.

## 📋 Requisitos Previos

1. Node.js (v20.9+ recomendado)
2. Cuenta de Google Cloud con la API de Google Drive habilitada.
3. Cuenta de Resend (para el envío de emails).

## 🛠 Instalación y Configuración Local

1. Instalar las dependencias:
   ```bash
   npm install
   ```

2. Configurar variables de entorno:
   Renombra o copia el archivo `.env.example` a `.env.local` y rellena los valores.
   
   - **`BETTER_AUTH_SECRET`**: Genera un string aleatorio (puedes usar `npx better-auth generate-secret` o cualquier generador UUID).
   - **`DRIVE_ROOT_FOLDER_ID`**: El ID de la carpeta en Google Drive donde se guardarán los archivos. (Por defecto: `182uxxUjN7KJJDm1vAZ_AEyKvAwwcTPxY`)

3. Ejecutar el servidor de desarrollo:
   ```bash
   npm run dev
   ```
   Abre [http://localhost:3000](http://localhost:3000) en tu navegador.

## 🔐 Obtener Credenciales de Google (Paso a Paso)

1. Ve a la [Consola de Google Cloud](https://console.cloud.google.com/).
2. Crea un nuevo proyecto.
3. En el menú, ve a **APIs & Services > Library** y habilita la **Google Drive API**.
4. Ve a **APIs & Services > OAuth consent screen**. Configúralo como Externo o Interno según necesites, y añade tu correo electrónico.
5. Ve a **APIs & Services > Credentials**.
6. Haz clic en **Create Credentials > OAuth client ID**.
7. Selecciona **Web application**.
8. Añade en "Authorized JavaScript origins": `http://localhost:3000` (y tu dominio de producción luego).
9. Añade en "Authorized redirect URIs": `http://localhost:3000/api/auth/callback/google` (y la ruta equivalente para producción).
10. Obtendrás tu **Client ID** y **Client Secret**. Añádelos al archivo `.env.local`.

*(Nota: Para el uso continuo sin re-autenticar la app constantemente, necesitarás configurar un mecanismo para refrescar y guardar el Google Refresh Token asociado a la cuenta de servicio o administrador principal).*

## ☁️ Despliegue en Vercel

1. Haz push de tu código a GitHub.
2. En [Vercel](https://vercel.com/), crea un nuevo proyecto e importa tu repositorio de GitHub.
3. Configura las **Variables de Entorno** en Vercel copiando los valores de tu `.env.local`. Asegúrate de cambiar `BETTER_AUTH_URL` a tu dominio real de Vercel (ej: `https://tu-app.vercel.app`).
4. Haz deploy.

## 📁 Estructura del Proyecto en Drive

La aplicación interactúa con Google Drive creando la siguiente estructura a partir del `DRIVE_ROOT_FOLDER_ID`:

```
📁 ARTISTAS (DRIVE_ROOT_FOLDER_ID)
├── 📁 [Nombre Artista]/
│   ├── 📄 artist_config.json
│   ├── 📁 Images/
│   ├── 📁 [Nombre Proyecto 1]/
│   │   ├── 📄 project_config.json
│   │   ├── 📁 Sessions/
│   │   ├── 📁 Bounces/
│   │   ├── 📁 Mix/
│   │   ├── 📁 Master/
│   │   ├── 📁 References/
│   │   └── 📁 Other/
│   └── 📁 [Nombre Proyecto 2]/
```
