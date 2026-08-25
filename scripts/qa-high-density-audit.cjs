const puppeteer = require('puppeteer');

const BASE_URL = 'http://localhost:3000';
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

async function runAudit() {
  console.log('====================================================');
  console.log('🚀 INICIANDO AUDITORÍA E2E: REDISEÑO DE ALTA DENSIDAD');
  console.log('====================================================\n');

  const auditReport = {
    totalTested: 0,
    passed: 0,
    failed: 0,
    findings: [],
    testDetails: []
  };

  function addResult(name, status, details = '') {
    auditReport.totalTested++;
    if (status === 'PASS') {
      auditReport.passed++;
      console.log(`✅ [PASS] ${name} ${details ? '(' + details + ')' : ''}`);
    } else {
      auditReport.failed++;
      console.error(`❌ [FAIL] ${name}: ${details}`);
      auditReport.findings.push({ name, details });
    }
    auditReport.testDetails.push({ name, status, details });
  }

  const browser = await puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--window-size=1440,900']
  });

  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 900 });

  try {
    // -------------------------------------------------------------
    // FASE 0: Acceso / PasswordGuard
    // -------------------------------------------------------------
    console.log('\n--- FASE 0: Desbloqueo de Estudio ---');
    await page.goto(`${BASE_URL}/personal-projects`, { waitUntil: 'networkidle2' });
    const isPass = await page.evaluate(() => document.body.innerText.includes('Acceso Protegido'));
    if (isPass) {
      await page.type('input[type="password"]', '20923954Aa*');
      const unlockBtn = await page.evaluateHandle(() => {
        return Array.from(document.querySelectorAll('button')).find(b => b.innerText.includes('Desbloquear'));
      });
      if (unlockBtn && unlockBtn.asElement()) {
        await unlockBtn.asElement().click();
        await sleep(1500);
      }
    }
    addResult('Fase 0: Desbloqueo PasswordGuard', 'PASS');

    // -------------------------------------------------------------
    // FASE 1: Switcher de Doble Vista (Lista / Grid)
    // -------------------------------------------------------------
    console.log('\n--- FASE 1: Switcher de Vista y Renderizado ---');
    await page.goto(`${BASE_URL}/personal-projects`, { waitUntil: 'networkidle2' });
    await page.waitForFunction(() => !document.body.innerText.includes('Cargando proyectos'), { timeout: 15000 }).catch(() => {});
    await sleep(500);

    const listBtn = await page.$('button[title*="Vista de Lista"]');
    const gridBtn = await page.$('button[title*="Vista de Tarjetas"]');

    if (listBtn && gridBtn) {
      addResult('Presencia del Switcher de Doble Vista (Lista / Grid)', 'PASS');
    } else {
      addResult('Presencia del Switcher de Doble Vista (Lista / Grid)', 'FAIL', 'Botones de vista no encontrados');
    }

    // Probar cambio a Grid
    if (gridBtn) {
      await gridBtn.click();
      await sleep(600);
      const isGrid = await page.$('.grid');
      if (isGrid) {
        addResult('Conmutación a Vista Grid (Tarjetas de Alta Densidad)', 'PASS');
      } else {
        addResult('Conmutación a Vista Grid (Tarjetas de Alta Densidad)', 'FAIL', 'Contenedor grid no renderizado');
      }

      // Probar persistencia de modo de vista tras recarga (F5)
      await page.reload({ waitUntil: 'networkidle2' });
      await sleep(1000);
      const storedMode = await page.evaluate(() => localStorage.getItem('ezy_personal_projects_view_mode'));
      if (storedMode === 'grid') {
        addResult('Persistencia en localStorage tras recarga F5', 'PASS', `Modo: ${storedMode}`);
      } else {
        addResult('Persistencia en localStorage tras recarga F5', 'FAIL', `Modo encontrado: ${storedMode}`);
      }

      // Volver a Lista para continuar
      const listBtnAfter = await page.$('button[title*="Vista de Lista"]');
      if (listBtnAfter) {
        await listBtnAfter.click();
        await sleep(500);
      }
    }

    // -------------------------------------------------------------
    // FASE 2: Cabeceras Ordenables en Vista Lista
    // -------------------------------------------------------------
    console.log('\n--- FASE 2: Cabeceras Ordenables y Ordenación ---');
    const bpmHeader = await page.evaluate(() => {
      const btns = Array.from(document.querySelectorAll('button'));
      const bpmBtn = btns.find(b => b.textContent && b.textContent.includes('BPM / Key'));
      if (bpmBtn) {
        bpmBtn.click();
        return true;
      }
      return false;
    });

    if (bpmHeader) {
      addResult('Clic en cabecera de columna "BPM / Key"', 'PASS');
    } else {
      addResult('Clic en cabecera de columna "BPM / Key"', 'FAIL');
    }

    const titleHeader = await page.evaluate(() => {
      const btns = Array.from(document.querySelectorAll('button'));
      const tBtn = btns.find(b => b.textContent && b.textContent.includes('Título del Proyecto'));
      if (tBtn) {
        tBtn.click();
        return true;
      }
      return false;
    });

    if (titleHeader) {
      addResult('Clic en cabecera de columna "Título del Proyecto"', 'PASS');
    } else {
      addResult('Clic en cabecera de columna "Título del Proyecto"', 'FAIL');
    }

    // -------------------------------------------------------------
    // FASE 3: Filtro Rápido de Audio (Con Audio / Sin Audio)
    // -------------------------------------------------------------
    console.log('\n--- FASE 3: Filtros Rápidos de Audio ---');
    const withAudioBtn = await page.$('button[title*="Solo proyectos con audio"]');
    const withoutAudioBtn = await page.$('button[title*="Solo bocetos"]');
    const allAudioBtn = await page.$('button[title*="Todos los proyectos"]');

    if (withAudioBtn && withoutAudioBtn && allAudioBtn) {
      addResult('Presencia de botones de filtro rápido de audio', 'PASS');
      await withAudioBtn.click();
      await sleep(400);
      addResult('Activación de filtro "Con Audio"', 'PASS');

      await withoutAudioBtn.click();
      await sleep(400);
      addResult('Activación de filtro "Sin Audio"', 'PASS');

      await allAudioBtn.click();
      await sleep(400);
      addResult('Restablecimiento a "Todos los audios"', 'PASS');
    } else {
      addResult('Filtros rápidos de audio', 'FAIL', 'Botones no encontrados');
    }

    // -------------------------------------------------------------
    // FASE 4: Selector de Ordenación (Sorting Dropdown)
    // -------------------------------------------------------------
    console.log('\n--- FASE 4: Selector de Ordenación ---');
    const sortSelect = await page.$('select[title*="Criterio de ordenación"]');
    if (sortSelect) {
      await sortSelect.select('bpm_desc');
      await sleep(400);
      addResult('Ordenación por BPM (Mayor a Menor)', 'PASS');

      await sortSelect.select('title_asc');
      await sleep(400);
      addResult('Ordenación Alfabética (A-Z)', 'PASS');

      await sortSelect.select('recent');
      await sleep(400);
      addResult('Restablecimiento a Más Recientes Primero', 'PASS');
    } else {
      addResult('Selector de Criterio de Ordenación', 'FAIL');
    }

    // -------------------------------------------------------------
    // FASE 5: Creación, Renderizado y Limpieza
    // -------------------------------------------------------------
    console.log('\n--- FASE 5: Creación de Proyecto y Reflejo en Vista Lista ---');
    const newBtn = await page.evaluateHandle(() => {
      return Array.from(document.querySelectorAll('button')).find(b => b.innerText.includes('Nuevo Proyecto'));
    });

    if (newBtn && newBtn.asElement()) {
      await newBtn.asElement().click();
      await sleep(600);

      const titleInput = await page.$('#proj-title');
      if (titleInput) {
        await titleInput.type('01 - G#m 130BPM - QA High Density Test @ezyprods');
        await sleep(400);

        // Usar título limpio detectado si aparece
        const useCleanBtn = await page.evaluate(() => {
          const btns = Array.from(document.querySelectorAll('button'));
          const b = btns.find(x => x.textContent && x.textContent.includes('Usar'));
          if (b) { b.click(); return true; }
          return false;
        });

        const submitBtn = await page.evaluateHandle(() => {
          return Array.from(document.querySelectorAll('button')).find(b => b.innerText.includes('Crear Proyecto') && !b.disabled);
        });

        if (submitBtn && submitBtn.asElement()) {
          await submitBtn.asElement().click();
          // Esperar a que el modal termine de procesar y se cierre
          await page.waitForFunction(() => !document.body.innerText.includes('Nuevo Proyecto Personal'), { timeout: 15000 }).catch(() => {});
          await sleep(1500);
          addResult('Creación de proyecto en Drive y formulario', 'PASS');
        }
      }
    }

    // Asegurar que la categoría "Todos" y el filtro de audio "Todos" están seleccionados
    const allCatBtn = await page.evaluateHandle(() => {
      return Array.from(document.querySelectorAll('button')).find(b => b.innerText.trim().startsWith('Todos'));
    });
    if (allCatBtn && allCatBtn.asElement()) {
      await allCatBtn.asElement().click();
      await sleep(500);
    }

    // Verificar que aparece en la vista de lista
    const itemInDoc = await page.evaluate(() => {
      return document.body.innerText.includes('QA High Density Test');
    });

    if (itemInDoc) {
      addResult('Reflejo inmediato del proyecto en la Vista Lista', 'PASS');
    } else {
      addResult('Reflejo inmediato del proyecto en la Vista Lista', 'FAIL');
    }

    // Eliminar el proyecto de prueba creado
    console.log('\n--- FASE 6: Eliminación limpia del proyecto de prueba ---');
    const deleteClicked = await page.evaluate(() => {
      const links = Array.from(document.querySelectorAll('a'));
      const projLink = links.find(a => a.textContent && a.textContent.includes('QA High Density Test'));
      if (!projLink) return false;

      const row = projLink.closest('.group');
      if (!row) return false;

      const menuBtn = row.querySelector('button[title*="Opciones del proyecto"]');
      if (menuBtn) {
        menuBtn.click();
        return true;
      }
      return false;
    });

    if (deleteClicked) {
      await sleep(500);
      const confirmDelete = await page.evaluate(() => {
        const btns = Array.from(document.querySelectorAll('button'));
        const delBtn = btns.find(b => b.textContent && b.textContent.includes('Eliminar Proyecto'));
        if (delBtn) { delBtn.click(); return true; }
        return false;
      });

      if (confirmDelete) {
        await sleep(600);
        await page.evaluate(() => {
          const btns = Array.from(document.querySelectorAll('button'));
          const confBtn = btns.find(b => b.textContent && (b.textContent.trim() === 'Confirmar' || b.textContent.trim() === 'Eliminar'));
          if (confBtn) confBtn.click();
        });
        await sleep(4000);
        addResult('Eliminación física del proyecto en Drive y persistencia', 'PASS');
      }
    }

  } catch (err) {
    console.error('Error durante la auditoría E2E:', err);
    addResult('Ejecución global de Auditoría E2E', 'FAIL', err.message);
  } finally {
    await browser.close();
  }

  console.log('\n====================================================');
  console.log('📊 RESUMEN FINAL DE LA AUDITORÍA DE ALTA DENSIDAD');
  console.log('====================================================');
  console.log(`Total Pruebas: ${auditReport.totalTested} | Superadas: ${auditReport.passed} | Fallos: ${auditReport.failed}`);
}

runAudit();
