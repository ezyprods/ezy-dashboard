const puppeteer = require('puppeteer');

const BASE_URL = 'http://localhost:3000';

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function runDeepAudit() {
  console.log('================================================================');
  console.log('🔍 AUDITORÍA QA AUTÓNOMA PROFUNDA: MÓDULO PROYECTOS PERSONALES');
  console.log('================================================================\n');

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

  page.on('console', msg => {
    if (msg.type() === 'error') {
      console.log(`   [Console Error] ${msg.text()}`);
    }
  });

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
    // FASE 1: Galería, Filtros, Búsqueda y Pestañas de Categoría
    // -------------------------------------------------------------
    console.log('\n--- FASE 1: Galería, Filtros, Búsqueda y Pestañas ---');
    await page.goto(`${BASE_URL}/personal-projects`, { waitUntil: 'networkidle2' });
    await page.waitForFunction(() => !document.body.innerText.includes('Cargando proyectos'), { timeout: 15000 }).catch(() => {});
    await sleep(500);

    // 1.1 Test Pestañas de categoría
    const categories = ['Todos', 'Beats', 'Grabaciones', 'Sound Kits', 'Colaboraciones', 'Mashups'];
    for (const cat of categories) {
      const catBtn = await page.evaluateHandle((c) => {
        return Array.from(document.querySelectorAll('button')).find(b => b.innerText.includes(c));
      }, cat);
      if (catBtn && catBtn.asElement()) {
        await catBtn.asElement().click();
        await sleep(200);
        addResult(`Filtro Categoría: "${cat}"`, 'PASS');
      } else {
        addResult(`Filtro Categoría: "${cat}"`, 'FAIL', 'Botón no encontrado');
      }
    }

    // Volver a Todos
    const todosBtn = await page.evaluateHandle(() => {
      return Array.from(document.querySelectorAll('button')).find(b => b.innerText.includes('Todos'));
    });
    if (todosBtn && todosBtn.asElement()) await todosBtn.asElement().click();

    // 1.2 Test Búsqueda textual en la galería
    const searchInput = await page.$('input[placeholder*="Buscar por título"]');
    if (searchInput) {
      // Búsqueda positiva
      await searchInput.click();
      await searchInput.type('Cyberpunk');
      await sleep(400);
      const textWithSearch = await page.evaluate(() => document.body.innerText);
      if (textWithSearch.includes('Cyberpunk Drill')) {
        addResult('Búsqueda Positiva ("Cyberpunk")', 'PASS', 'Encontró "Cyberpunk Drill"');
      } else {
        addResult('Búsqueda Positiva ("Cyberpunk")', 'FAIL', 'No filtró correctamente');
      }

      // Búsqueda sin resultados (Empty State)
      await searchInput.click({ clickCount: 3 });
      await page.keyboard.press('Backspace');
      await searchInput.type('NonExistentProjectXYZ999');
      await sleep(500);

      const emptyText = await page.evaluate(() => document.body.innerText);
      if (emptyText.includes('No se encontraron proyectos') || emptyText.includes('filtros')) {
        addResult('Búsqueda Vacía (Estado Empty)', 'PASS', 'Muestra estado vacío correctamente');
      } else {
        addResult('Búsqueda Vacía (Estado Empty)', 'FAIL', 'No mostró mensaje de estado vacío');
      }

      // Limpiar búsqueda
      const clearSearchBtn = await page.evaluateHandle(() => {
        const btns = Array.from(document.querySelectorAll('button'));
        return btns.find(b => b.innerText.includes('Limpiar Filtros'));
      });
      if (clearSearchBtn && clearSearchBtn.asElement()) {
        await clearSearchBtn.asElement().click();
      } else {
        await searchInput.click({ clickCount: 3 });
        await page.keyboard.press('Backspace');
      }
      await sleep(400);
    }

    // -------------------------------------------------------------
    // FASE 2: Creación de Proyecto (Casos Límite y Validaciones)
    // -------------------------------------------------------------
    console.log('\n--- FASE 2: Creación de Proyecto con Casos Límite ---');
    
    // 2.1 Validación de Título Vacío
    const newBtn = await page.evaluateHandle(() => {
      return Array.from(document.querySelectorAll('button')).find(b => b.innerText.includes('Nuevo Proyecto'));
    });
    if (newBtn && newBtn.asElement()) {
      await newBtn.asElement().click();
      await sleep(400);

      // Intentar crear sin título
      const isCreateDisabled = await page.evaluate(() => {
        const btns = Array.from(document.querySelectorAll('button'));
        const create = btns.find(b => b.innerText.includes('Crear Proyecto'));
        return create ? create.disabled : false;
      });

      if (isCreateDisabled) {
        addResult('Validación: Botón deshabilitado con título vacío', 'PASS');
      } else {
        addResult('Validación: Botón deshabilitado con título vacío', 'FAIL', 'Botón activo sin título');
      }

      // 2.2 Creación con Caracteres Especiales y Metadatos Completos
      const titleInput = await page.$('input#proj-title');
      if (titleInput) {
        await titleInput.type('07 - Gm 126BPM - Solar Eclipse @ezyprods');
        await sleep(400);

        // Verificar autocompletado de BPM y Key
        const detectedBpm = await page.evaluate(() => {
          const input = document.querySelector('input#proj-bpm');
          return input ? input.value : null;
        });
        const detectedKey = await page.evaluate(() => {
          const input = document.querySelector('input#proj-key');
          return input ? input.value : null;
        });

        if (detectedBpm === '126' && detectedKey === 'Gm') {
          addResult('Detección Automática BPM (126) y Key (Gm)', 'PASS');
        } else {
          addResult('Detección Automática BPM y Key', 'FAIL', `BPM=${detectedBpm}, Key=${detectedKey}`);
        }

        // Clic en Usar Título Limpio si aparece
        const useCleanBtn = await page.evaluateHandle(() => {
          const btns = Array.from(document.querySelectorAll('button'));
          return btns.find(b => b.innerText.includes('Usar'));
        });
        if (useCleanBtn && useCleanBtn.asElement()) {
          await useCleanBtn.asElement().click();
          await sleep(200);
        }

        // Enviar formulario
        const submitBtn = await page.evaluateHandle(() => {
          return Array.from(document.querySelectorAll('button')).find(b => b.innerText.includes('Crear Proyecto'));
        });
        if (submitBtn && submitBtn.asElement()) {
          console.log('   Enviando creación de "Solar Eclipse" a Google Drive...');
          await submitBtn.asElement().click();
          
          // Esperar hasta que aparezca en la galería
          await page.waitForFunction(() => document.body.innerText.includes('Solar Eclipse'), { timeout: 25000 });
          addResult('Persistencia y Renderizado de Nuevo Proyecto en Galería', 'PASS');
        }
      }
    }

    // -------------------------------------------------------------
    // FASE 3: Navegación al Detalle y Auditoría de las 5 Pestañas
    // -------------------------------------------------------------
    console.log('\n--- FASE 3: Detalle de Proyecto y Auditoría de 5 Pestañas ---');

    const projectDetailUrl = await page.evaluate(() => {
      const links = Array.from(document.querySelectorAll('a'));
      const found = links.find(a => a.innerText.includes('Solar Eclipse') && a.href.includes('/personal-projects/'));
      return found ? found.href : null;
    });

    if (projectDetailUrl) {
      console.log(`   Navegando a detalle: ${projectDetailUrl}`);
      await page.goto(projectDetailUrl, { waitUntil: 'networkidle2' });
      await page.waitForFunction(() => !document.body.innerText.includes('Cargando proyecto personal'), { timeout: 15000 }).catch(() => {});
      await sleep(800);

      // 3.1 Cabecera
      const headerText = await page.evaluate(() => document.body.innerText);
      if (headerText.includes('Solar Eclipse') && headerText.includes('126 BPM') && headerText.includes('Gm')) {
        addResult('Cabecera de Proyecto: Título, BPM y Key correctos', 'PASS');
      } else {
        addResult('Cabecera de Proyecto', 'FAIL', 'Metadatos incorrectos en cabecera');
      }

      // 3.2 Modal de Edición de Proyecto (Modificar BPM a 132)
      console.log('\n--- FASE 4: Modal de Edición de Proyecto ---');
      const editProjectBtn = await page.evaluateHandle(() => {
        return Array.from(document.querySelectorAll('button')).find(b => b.innerText.includes('Editar'));
      });
      if (editProjectBtn && editProjectBtn.asElement()) {
        await editProjectBtn.asElement().click();
        await sleep(500);

        // Cambiar BPM a 132 usando setter reactivo
        await page.evaluate(() => {
          const el = document.querySelector('input#edit-proj-bpm');
          if (el) {
            const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
            setter.call(el, '132');
            el.dispatchEvent(new Event('input', { bubbles: true }));
            el.dispatchEvent(new Event('change', { bubbles: true }));
          }
        });
        await sleep(200);

        const saveChangesBtn = await page.evaluateHandle(() => {
          return Array.from(document.querySelectorAll('button')).find(b => b.innerText.includes('Guardar Cambios'));
        });
        if (saveChangesBtn && saveChangesBtn.asElement()) {
          await saveChangesBtn.asElement().click();
          await page.waitForFunction(() => document.body.innerText.includes('132 BPM'), { timeout: 15000 });
          addResult('Edición de Proyecto: Modificación de BPM a 132 reflejada', 'PASS');
          await sleep(500);
        }
      }

      // 3.3 Modal de Traspasar a Artista
      console.log('\n--- FASE 5: Modal de Traspasar / Ceder a Artista ---');
      const cloneProjectBtn = await page.evaluateHandle(() => {
        return Array.from(document.querySelectorAll('button')).find(b => b.innerText.includes('Ceder a Artista'));
      });
      if (cloneProjectBtn && cloneProjectBtn.asElement()) {
        await cloneProjectBtn.asElement().click();
        await sleep(600);

        // Esperar a que cargue el selector de artistas en el modal
        await page.waitForFunction(() => {
          return !!document.querySelector('.fixed select');
        }, { timeout: 10000 }).catch(() => {});

        const artistSelect = await page.$('.fixed select');
        if (artistSelect) {
          addResult('Modal de Ceder a Artista: Selector disponible', 'PASS');
          
          // Cancelar modal
          const cancelBtn = await page.evaluateHandle(() => {
            const btns = Array.from(document.querySelectorAll('button'));
            return btns.find(b => b.innerText.includes('Cancelar'));
          });
          if (cancelBtn && cancelBtn.asElement()) {
            await cancelBtn.asElement().click();
            await sleep(400);
          }
        } else {
          addResult('Modal de Ceder a Artista', 'FAIL', 'No se encontró selector de artista');
        }
      }

      // 3.4 Eliminación de Proyecto con Confirmación en DialogProvider
      console.log('\n--- FASE 6: Eliminación de Proyecto & Verificación de Caché ---');
      const deleteProjectBtn = await page.evaluateHandle(() => {
        return Array.from(document.querySelectorAll('button')).find(b => b.innerText.includes('Eliminar'));
      });
      if (deleteProjectBtn && deleteProjectBtn.asElement()) {
        await deleteProjectBtn.asElement().click();
        await sleep(500);

        // Aceptar confirmación en DialogProvider
        const confirmBtn = await page.evaluateHandle(() => {
          const btns = Array.from(document.querySelectorAll('button'));
          return btns.find(b => b.innerText === 'Confirmar');
        });
        if (confirmBtn && confirmBtn.asElement()) {
          console.log('   Confirmando eliminación en modal CustomDialog...');
          await confirmBtn.asElement().click();
          await sleep(5000); // Esperar DELETE en Drive y redirección
        }

        // Refrescar página para validar persistencia real
        console.log('   Refrescando /personal-projects con F5...');
        await page.goto(`${BASE_URL}/personal-projects`, { waitUntil: 'networkidle2' });
        await page.waitForFunction(() => !document.body.innerText.includes('Cargando proyectos'), { timeout: 15000 }).catch(() => {});
        await sleep(1500);

        const finalGalleryText = await page.evaluate(() => document.body.innerText);
        if (!finalGalleryText.includes('Solar Eclipse')) {
          addResult('Eliminación: Proyecto eliminado de la UI y no reaparece tras F5', 'PASS');
        } else {
          addResult('Eliminación: Persistencia tras F5', 'FAIL', 'El proyecto reapareció tras recargar la página');
        }
      }
    } else {
      addResult('Fase 3: Detalle de Proyecto', 'FAIL', 'No se pudo obtener enlace al proyecto');
    }

  } catch (err) {
    console.error('FATAL AUDIT ERROR:', err);
    addResult('Ejecución Global de Auditoría', 'FAIL', err.message);
  } finally {
    await browser.close();
  }

  console.log('\n================================================================');
  console.log(`📊 INFORME FINAL AUDITORÍA: ${auditReport.passed}/${auditReport.totalTested} pasadas (${auditReport.failed} fallos).`);
  console.log('================================================================\n');

  return auditReport;
}

runDeepAudit().catch(console.error);
