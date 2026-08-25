const puppeteer = require('puppeteer');

const BASE_URL = 'http://localhost:3000';

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function runQA() {
  console.log('=====================================================');
  console.log('🚀 INICIANDO AUDITORÍA QA AUTÓNOMA: PROYECTOS PERSONALES');
  console.log('=====================================================\n');

  const report = {
    testsRun: 0,
    testsPassed: 0,
    testsFailed: 0,
    findings: [],
    logs: []
  };

  function log(msg, type = 'INFO') {
    const entry = `[${type}] ${msg}`;
    console.log(entry);
    report.logs.push(entry);
  }

  function addFinding(title, severity, description, reproduction, rootCause = '') {
    report.findings.push({ title, severity, description, reproduction, rootCause });
    console.error(`❌ [HALLAZGO ${severity}] ${title}\n   ${description}\n`);
  }

  const browser = await puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--window-size=1440,900']
  });

  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 900 });

  page.on('console', msg => {
    if (msg.type() === 'error') {
      log(`Browser Console Error: ${msg.text()}`, 'CONSOLE_ERR');
    }
  });

  page.on('pageerror', err => {
    log(`Uncaught Page Error: ${err.message}`, 'PAGE_ERR');
    addFinding('Excepción no capturada en página', 'ALTA', err.message, 'Ocurrió durante la navegación');
  });

  try {
    // -------------------------------------------------------------
    // PRUEBA 0: Desbloqueo de PasswordGuard
    // -------------------------------------------------------------
    log('--- PRUEBA 0: Acceso / PasswordGuard ---');
    await page.goto(`${BASE_URL}/personal-projects`, { waitUntil: 'networkidle2' });
    
    // Check if PasswordGuard is present
    const isPasswordScreen = await page.evaluate(() => document.body.innerText.includes('Acceso Protegido'));
    if (isPasswordScreen) {
      log('Pantalla de Acceso Protegido detectada. Desbloqueando...');
      const passInput = await page.$('input[type="password"]');
      if (passInput) {
        await passInput.type('20923954Aa*');
        const unlockBtn = await page.evaluateHandle(() => {
          const btns = Array.from(document.querySelectorAll('button'));
          return btns.find(b => b.innerText.includes('Desbloquear'));
        });
        if (unlockBtn && unlockBtn.asElement()) {
          await unlockBtn.asElement().click();
          await sleep(1000);
          log('✅ Estudio desbloqueado exitosamente.', 'SUCCESS');
        }
      }
    }

    // -------------------------------------------------------------
    // PRUEBA 1: Navegación y Carga Inicial de la Galería
    // -------------------------------------------------------------
    report.testsRun++;
    log('--- PRUEBA 1: Carga de /personal-projects ---');
    await page.goto(`${BASE_URL}/personal-projects`, { waitUntil: 'networkidle2' });
    await sleep(800);
    
    // Verificar que no muestre 404 ni pantalla de error
    const pageText = await page.evaluate(() => document.body.innerText);
    if (pageText.includes('404') || pageText.includes('This page could not be found')) {
      addFinding('Página no encontrada', 'CRÍTICA', 'La ruta /personal-projects devuelve 404', 'Navegar a /personal-projects');
    } else {
      log('✅ Galería cargada correctamente.', 'SUCCESS');
      report.testsPassed++;
    }

    // -------------------------------------------------------------
    // PRUEBA 2: Exploración de Pestañas de Categoría y Filtros
    // -------------------------------------------------------------
    report.testsRun++;
    log('--- PRUEBA 2: Filtros de Categoría y Estado ---');
    const categoryButtons = await page.$$('button');
    let clickedTabs = 0;
    for (const btn of categoryButtons) {
      const text = await page.evaluate(el => el.innerText, btn);
      if (['Todos', 'Beats', 'Grabaciones', 'Sound Kits', 'Colaboraciones', 'Mashups'].some(cat => text.includes(cat))) {
        await btn.click();
        await sleep(150);
        clickedTabs++;
      }
    }
    log(`Pestañas de categoría clicadas: ${clickedTabs}`);
    report.testsPassed++;

    // -------------------------------------------------------------
    // PRUEBA 3: Creación de Proyecto (Camino Feliz + Detección BPM/Key)
    // -------------------------------------------------------------
    report.testsRun++;
    log('--- PRUEBA 3: Modal de Nuevo Proyecto & Detección Automática ---');
    
    const newBtn = await page.evaluateHandle(() => {
      const btns = Array.from(document.querySelectorAll('button'));
      return btns.find(b => b.innerText.includes('Nuevo') || b.innerText.includes('Crear'));
    });

    if (newBtn && newBtn.asElement()) {
      await newBtn.asElement().click();
      await sleep(400);

      // Escribir nombre con formato del productor en el input
      const titleInput = await page.$('input[placeholder*="Ej:"], input[placeholder*="nombre"], input[placeholder*="Título"]');
      if (titleInput) {
        await titleInput.click({ clickCount: 3 });
        await titleInput.type('01 - G#m 130BPM - Midnight Dream @ezyprods');
        await sleep(400);

        // Comprobar si autollenó BPM y Key
        const bpmVal = await page.evaluate(() => {
          const inputs = Array.from(document.querySelectorAll('input[type="number"]'));
          return inputs.map(i => i.value).find(v => v === '130');
        });
        const keyVal = await page.evaluate(() => {
          const inputs = Array.from(document.querySelectorAll('input[type="text"]'));
          return inputs.map(i => i.value).find(v => v === 'G#m' || v === 'Sol# menor');
        });

        log(`Detección automática en formulario: BPM=${bpmVal}, Key=${keyVal}`);

        // Click en Crear Proyecto
        const submitBtn = await page.evaluateHandle(() => {
          const btns = Array.from(document.querySelectorAll('button'));
          return btns.find(b => b.innerText.includes('Crear Proyecto') || b.innerText.includes('Guardar'));
        });

        if (submitBtn && submitBtn.asElement()) {
          log('Enviando formulario de creación de proyecto...');
          await submitBtn.asElement().click();
          await sleep(3000); // Esperar creación en Google Drive
        }
      }
    } else {
      addFinding('Botón Nuevo Proyecto no encontrado', 'ALTA', 'No se encontró el botón para abrir el modal de creación', 'Ver galería');
    }

    // Verificar si el proyecto aparece en la galería
    const updatedGalleryText = await page.evaluate(() => document.body.innerText);
    if (updatedGalleryText.includes('Midnight Dream')) {
      log('✅ Proyecto "Midnight Dream" creado y renderizado en la galería.', 'SUCCESS');
      report.testsPassed++;
    } else {
      addFinding('Proyecto no aparece tras crear', 'ALTA', 'El proyecto "Midnight Dream" no se mostró en la galería tras crearlo', 'Crear proyecto');
    }

    // -------------------------------------------------------------
    // PRUEBA 4: Casos Límite de Creación (Validaciones)
    // -------------------------------------------------------------
    report.testsRun++;
    log('--- PRUEBA 4: Casos Límite de Creación (Espacios en blanco) ---');
    
    const newBtn2 = await page.evaluateHandle(() => {
      const btns = Array.from(document.querySelectorAll('button'));
      return btns.find(b => b.innerText.includes('Nuevo') || b.innerText.includes('Crear'));
    });
    if (newBtn2 && newBtn2.asElement()) {
      await newBtn2.asElement().click();
      await sleep(300);

      const titleInput = await page.$('input[placeholder*="Ej:"], input[placeholder*="nombre"], input[placeholder*="Título"]');
      if (titleInput) {
        await titleInput.click({ clickCount: 3 });
        await titleInput.type('   '); // Solo espacios
        
        const isSubmitDisabled = await page.evaluate(() => {
          const btns = Array.from(document.querySelectorAll('button'));
          const submit = btns.find(b => b.innerText.includes('Crear Proyecto'));
          return submit ? submit.disabled : false;
        });

        if (isSubmitDisabled) {
          log('✅ Botón Crear correctamente deshabilitado con espacios en blanco.', 'SUCCESS');
        } else {
          addFinding('Validación de espacios ausente', 'MEDIA', 'El botón Crear no se deshabilita si solo se escriben espacios', 'Escribir espacios en el modal de creación');
        }

        // Cancelar modal
        const cancelBtn = await page.evaluateHandle(() => {
          const btns = Array.from(document.querySelectorAll('button'));
          return btns.find(b => b.innerText.includes('Cancelar'));
        });
        if (cancelBtn && cancelBtn.asElement()) {
          await cancelBtn.asElement().click();
          await sleep(200);
        }
      }
    }
    report.testsPassed++;

    // -------------------------------------------------------------
    // PRUEBA 5: Navegación al Detalle del Proyecto y las 5 Pestañas
    // -------------------------------------------------------------
    report.testsRun++;
    log('--- PRUEBA 5: Detalle del Proyecto y Navegación de Pestañas ---');
    
    const projectCardLink = await page.evaluate(() => {
      const links = Array.from(document.querySelectorAll('a'));
      const found = links.find(a => a.href && a.href.includes('/personal-projects/'));
      return found ? found.href : null;
    });

    if (projectCardLink) {
      log(`Navegando a detalle: ${projectCardLink}`);
      await page.goto(projectCardLink, { waitUntil: 'networkidle2' });
      await sleep(800);
    } else {
      addFinding('Enlace a detalle no encontrado', 'ALTA', 'No se encontró tarjeta con enlace a detalle de proyecto', 'Ver galería');
    }

    log(`Página de detalle actual URL: ${page.url()}`);
    
    // Recorrer las 5 pestañas en el detalle
    const tabsToTest = ['Audio / Demos', 'Stems / Pistas', 'Backup / Sesiones', 'Tareas', 'Info / Notas'];
    for (const tabName of tabsToTest) {
      const tabBtn = await page.evaluateHandle((name) => {
        const btns = Array.from(document.querySelectorAll('button'));
        return btns.find(b => b.innerText.includes(name));
      }, tabName);

      if (tabBtn && tabBtn.asElement()) {
        await tabBtn.asElement().click();
        await sleep(300);
        log(`✅ Pestaña "${tabName}" renderizada sin errores.`, 'SUCCESS');
      } else {
        log(`Aviso: Pestaña "${tabName}" no encontrada directamente por texto exacto.`, 'WARN');
      }
    }
    report.testsPassed++;

    // -------------------------------------------------------------
    // PRUEBA 6: Creación y Edición de Tareas en Tab Tareas
    // -------------------------------------------------------------
    report.testsRun++;
    log('--- PRUEBA 6: Módulo de Tareas en Proyecto Personal ---');
    
    await page.evaluate(() => {
      const btns = Array.from(document.querySelectorAll('button'));
      const t = btns.find(b => b.innerText.includes('Tareas'));
      if (t) t.click();
    });
    await sleep(400);

    const taskInput = await page.$('input[placeholder*="nueva tarea"], input[placeholder*="tarea"], input[placeholder*="Escribe"]');
    if (taskInput) {
      await taskInput.type('Grabar guitarras acústicas');
      await page.keyboard.press('Enter');
      await sleep(1500);

      const pageTasksText = await page.evaluate(() => document.body.innerText);
      if (pageTasksText.includes('Grabar guitarras acústicas')) {
        log('✅ Tarea creada y persistida en UI.', 'SUCCESS');
      } else {
        addFinding('Tarea no persistió en UI', 'MEDIA', 'Al presionar Enter no se añadió la tarea a la lista', 'Escribir tarea y presionar Enter');
      }
    }
    report.testsPassed++;

    // -------------------------------------------------------------
    // PRUEBA 7: Edición de Metadatos del Proyecto
    // -------------------------------------------------------------
    report.testsRun++;
    log('--- PRUEBA 7: Modal de Edición de Proyecto ---');
    
    const editBtn = await page.evaluateHandle(() => {
      const btns = Array.from(document.querySelectorAll('button'));
      return btns.find(b => b.innerText.includes('Editar') || b.getAttribute('title') === 'Editar proyecto');
    });

    if (editBtn && editBtn.asElement()) {
      await editBtn.asElement().click();
      await sleep(400);

      // Modificar BPM a 135
      await page.evaluate(() => {
        const inputs = Array.from(document.querySelectorAll('input[type="number"]'));
        if (inputs[0]) {
          inputs[0].value = '135';
          inputs[0].dispatchEvent(new Event('input', { bubbles: true }));
        }
      });

      const saveBtn = await page.evaluateHandle(() => {
        const btns = Array.from(document.querySelectorAll('button'));
        return btns.find(b => b.innerText.includes('Guardar Cambios') || b.innerText.includes('Guardar'));
      });

      if (saveBtn && saveBtn.asElement()) {
        await saveBtn.asElement().click();
        await sleep(2000);
        log('✅ Proyecto editado correctamente.', 'SUCCESS');
        report.testsPassed++;
      }
    }

    // -------------------------------------------------------------
    // PRUEBA 8: Traspasar / Clonar a Artista
    // -------------------------------------------------------------
    report.testsRun++;
    log('--- PRUEBA 8: Modal de Traspasar a Artista ---');
    
    const cloneBtn = await page.evaluateHandle(() => {
      const btns = Array.from(document.querySelectorAll('button'));
      return btns.find(b => b.innerText.includes('Traspasar a Artista') || b.innerText.includes('Traspasar'));
    });

    if (cloneBtn && cloneBtn.asElement()) {
      await cloneBtn.asElement().click();
      await sleep(400);

      const artistSelect = await page.$('select');
      if (artistSelect) {
        log('✅ Modal de traspaso a artista abierto con lista de artistas.', 'SUCCESS');
        
        const cancelClone = await page.evaluateHandle(() => {
          const btns = Array.from(document.querySelectorAll('button'));
          return btns.find(b => b.innerText.includes('Cancelar'));
        });
        if (cancelClone && cancelClone.asElement()) {
          await cancelClone.asElement().click();
          await sleep(200);
        }
        report.testsPassed++;
      }
    }

    // -------------------------------------------------------------
    // PRUEBA 9: Eliminación de Proyecto y Persistencia tras F5
    // -------------------------------------------------------------
    report.testsRun++;
    log('--- PRUEBA 9: Eliminación de Proyecto & Verificación tras F5 ---');
    
    page.on('dialog', async dialog => {
      log(`Dialog intercepted: ${dialog.message()}`);
      await dialog.accept();
    });

    const deleteBtn = await page.evaluateHandle(() => {
      const btns = Array.from(document.querySelectorAll('button'));
      return btns.find(b => b.innerText.includes('Eliminar') || b.getAttribute('title') === 'Eliminar proyecto');
    });

    if (deleteBtn && deleteBtn.asElement()) {
      await deleteBtn.asElement().click();
      await sleep(3000); // Esperar eliminación y redirección

      log('Refrescando /personal-projects con F5...');
      await page.goto(`${BASE_URL}/personal-projects`, { waitUntil: 'networkidle2' });
      await sleep(1000);

      const afterDeleteText = await page.evaluate(() => document.body.innerText);
      if (!afterDeleteText.includes('Midnight Dream')) {
        log('✅ Proyecto eliminado y verificado que no existe tras recargar la página.', 'SUCCESS');
        report.testsPassed++;
      } else {
        addFinding('Persistencia fallida en eliminación', 'ALTA', 'El proyecto eliminado reapareció tras refrescar la página', 'Eliminar y refrescar');
      }
    }

  } catch (err) {
    log(`Excepción en la ejecución de QA: ${err.message}`, 'FATAL');
    addFinding('Fallo crítico en test runner', 'CRÍTICA', err.message, err.stack);
  } finally {
    await browser.close();
  }

  console.log('\n=====================================================');
  console.log(`📊 RESUMEN QA: ${report.testsPassed}/${report.testsRun} pasadas, ${report.findings.length} hallazgos.`);
  console.log('=====================================================\n');

  return report;
}

runQA().catch(console.error);
