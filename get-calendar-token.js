const http = require('http');
const url = require('url');
const fs = require('fs');
const path = require('path');
const { google } = require('googleapis');

// 1. Leer .env.local de forma manual para evitar dependencias extra
const envPath = path.join(__dirname, '.env.local');
let envContent = '';
try {
  envContent = fs.readFileSync(envPath, 'utf8');
} catch (err) {
  console.error('Error: No se pudo leer el archivo .env.local');
  process.exit(1);
}

const env = {};
envContent.split('\n').forEach(line => {
  const match = line.match(/^\s*([\w.-]+)\s*=\s*(.*)?\s*$/);
  if (match) {
    let value = match[2] ? match[2].trim() : '';
    // Quitar comillas si las hay
    if (value.startsWith('"') && value.endsWith('"')) value = value.slice(1, -1);
    if (value.startsWith("'") && value.endsWith("'")) value = value.slice(1, -1);
    env[match[1]] = value;
  }
});

const CLIENT_ID = env.GOOGLE_CLIENT_ID;
const CLIENT_SECRET = env.GOOGLE_CLIENT_SECRET;
const BETTER_AUTH_URL = env.BETTER_AUTH_URL || 'http://localhost:3000';
const REDIRECT_URI = `${BETTER_AUTH_URL}/api/auth/callback/google`;

if (!CLIENT_ID || !CLIENT_SECRET) {
  console.error('Error: GOOGLE_CLIENT_ID o GOOGLE_CLIENT_SECRET no están definidos en .env.local');
  process.exit(1);
}

// 2. Configurar cliente OAuth2
const oauth2Client = new google.auth.OAuth2(
  CLIENT_ID,
  CLIENT_SECRET,
  REDIRECT_URI
);

// Solo scope de Calendar, porque Drive usa ezyprods2@gmail.com
const SCOPES = [
  'https://www.googleapis.com/auth/calendar'
];

// Generar URL de consentimiento
const authorizeUrl = oauth2Client.generateAuthUrl({
  access_type: 'offline', // Importante para obtener el refresh_token permanente
  scope: SCOPES,
  prompt: 'consent' // Obliga a mostrar la pantalla de consentimiento
});

// Extraer el puerto del redirect URI
const parsedRedirect = url.parse(REDIRECT_URI);
const PORT = parsedRedirect.port || 3000;
const PATHNAME = parsedRedirect.pathname || '/api/auth/callback/google';

console.log('\n==================================================');
console.log(' OBTENER GOOGLE REFRESH TOKEN PARA CALENDAR');
console.log('==================================================\n');
console.log('Este script te ayudará a obtener el token SOLO para Calendar (usarás ezyprods@gmail.com).');
console.log(`\n1. Asegúrate de detener temporalmente tu servidor de Next.js si está corriendo en el puerto ${PORT}.`);
console.log('2. Abre el siguiente enlace en tu navegador e inicia sesión con ezyprods@gmail.com:\n');
console.log('\x1b[36m%s\x1b[0m', authorizeUrl);
console.log('\n3. Esperando la respuesta de Google...\n');

// 3. Crear un servidor web temporal para capturar el código de redirección
const server = http.createServer(async (req, res) => {
  const reqUrl = url.parse(req.url, true);
  
  if (reqUrl.pathname === PATHNAME || reqUrl.pathname === '/api/auth/callback/google') {
    const code = reqUrl.query.code;
    
    if (!code) {
      res.writeHead(400, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end('<h1>Error</h1><p>No se recibió el código de autorización de Google.</p>');
      return;
    }
    
    try {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end('<h1>¡Autorizado con éxito!</h1><p>Puedes volver a la terminal para ver tus tokens. Ya puedes cerrar esta ventana.</p>');
      
      // Intercambiar el código por tokens
      const { tokens } = await oauth2Client.getToken(code);
      
      console.log('\n==================================================');
      console.log(' ¡TOKENS RECIBIDOS!');
      console.log('==================================================\n');
      console.log('Tu GOOGLE_CALENDAR_REFRESH_TOKEN nuevo es:\n');
      console.log('\x1b[32m%s\x1b[0m', tokens.refresh_token);
      console.log('\n--------------------------------------------------');
      
      if (tokens.refresh_token) {
        // Actualizar automáticamente .env.local
        let updatedEnv = envContent;
        const regex = /^GOOGLE_CALENDAR_REFRESH_TOKEN=.*$/m;
        if (regex.test(updatedEnv)) {
          updatedEnv = updatedEnv.replace(regex, `GOOGLE_CALENDAR_REFRESH_TOKEN=${tokens.refresh_token}`);
        } else {
          updatedEnv += `\nGOOGLE_CALENDAR_REFRESH_TOKEN=${tokens.refresh_token}`;
        }
        
        fs.writeFileSync(envPath, updatedEnv, 'utf8');
        console.log('✅ Tu archivo .env.local se ha actualizado automáticamente con el token de Calendar.');
        console.log('ℹ️ El código base ya está preparado para usar GOOGLE_CALENDAR_REFRESH_TOKEN automáticamente.');
      } else {
        console.log('⚠️ No se recibió un "refresh_token" nuevo.');
        console.log('Esto suele pasar si ya habías dado permisos antes a esta cuenta.');
        console.log('Ve a tu cuenta ezyprods@gmail.com (Seguridad -> Aplicaciones de terceros), revoca el acceso a la app, y vuelve a ejecutar este script.');
      }
      
      console.log('\nYa puedes volver a iniciar tu servidor de desarrollo con: npm run dev\n');
      
      server.close(() => {
        process.exit(0);
      });
    } catch (error) {
      console.error('Error al intercambiar el código por tokens:', error.message);
      res.writeHead(500, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(`<h1>Error</h1><p>Error al obtener el token: ${error.message}</p>`);
      server.close(() => {
        process.exit(1);
      });
    }
  } else {
    res.writeHead(404, { 'Content-Type': 'text/plain' });
    res.end('Not Found');
  }
});

server.listen(PORT, () => {
  // Servidor escuchando
});
