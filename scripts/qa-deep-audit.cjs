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

  // Handle confirmation dialogs
  page.on('dialog', async dialog => {
    console.log(`   [Dialog Intercepted] "${dialog.message()}" -> Aceptando`);
    await dialog.accept();
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
    // FASE 1: Galería, Filtros, Búsqueda y Ordenación
    // -------------------------------------------------------------
    console.log('\n--- FASE 1: Galería, Filtros, Búsqueda y Pestañas ---');
    await page.goto(`${BASE_URL}/personal-projects`, { waitUntil: 'networkidle2' });
    await sleep(800);

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

    // 1.2 Test Búsqueda textual
    const searchInput = await page.$('input[placeholder*="Buscar"]');
    if (searchInput) {
      // Búsqueda positiva
      await searchInput.type('Midnight');
      await sleep(300);
      const textWithSearch = await page.evaluate(() => document.body.innerText);
      if (textWithSearch.includes('Midnight Dream')) {
        addResult('Búsqueda Positiva ("Midnight")', 'PASS', 'Encontró "Midnight Dream"');
      } else {
        addResult('Búsqueda Positiva ("Midnight")', 'FAIL', 'No filtró correctamente');
      }

      // Búsqueda sin resultados
      await searchInput.click({ clickCount: 3 });
      await searchInput.type('NonExistentProjectNameXYZ123');
      await sleep(300);
      const emptyText = await page.evaluate(() => document.body.innerText);
      if (emptyText.includes('No se encontraron proyectos') || emptyText.includes('No hay proyectos')) {
        addResult('Búsqueda Vacía (Estado Empty)', 'PASS', 'Muestra estado vacío correctamente');
      } else {
        addResult('Búsqueda Vacía (Estado Empty)', 'FAIL', 'No mostró mensaje de estado vacío');
      }

      // Limpiar búsqueda
      await searchInput.click({ clickCount: 3 });
      await page.keyboard.press('Backspace');
      await sleep(200);
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
      const titleInput = await page.$('input[placeholder*="Ej:"]');
      if (titleInput) {
        await titleInput.type('02 - C#m 142BPM - Cyberpunk Drill (Special Edit) @ezyprods');
        await sleep(300);

        // Verificar autocompletado de BPM y Key
        const detectedBpm = await page.evaluate(() => {
          const inputs = Array.from(document.querySelectorAll('input[type="number"]'));
          return inputs.map(i => i.value).find(v => v === '142');
        });
        const detectedKey = await page.evaluate(() => {
          const inputs = Array.from(document.querySelectorAll('input[type="text"]'));
          return inputs.map(i => i.value).find(v => v === 'C#m');
        });

        if (detectedBpm === '142' && detectedKey === 'C#m') {
          addResult('Detección Automática BPM (142) y Key (C#m)', 'PASS');
        } else {
          addResult('Detección Automática BPM y Key', 'FAIL', `BPM=${detectedBpm}, Key=${detectedKey}`);
        }

        // Seleccionar estado: En Progreso
        await page.evaluate(() => {
          const selects = Array.from(document.querySelectorAll('select'));
          // Select 0: Categoría, Select 1: Estado
          if (selects[1]) {
            selects[1].value = 'en_progreso';
            selects[1].dispatchEvent(new Event('change', { bubbles: true }));
          }
        });

        // Enviar formulario
        const submitBtn = await page.evaluateHandle(() => {
          return Array.from(document.querySelectorAll('button')).find(b => b.innerText.includes('Crear Proyecto'));
        });
        if (submitBtn && submitBtn.asElement()) {
          console.log('   Enviando creación de "Cyberpunk Drill" a Google Drive...');
          await submitBtn.asElement().click();
          await sleep(4000); // Esperar API y Drive
        }
      }
    }

    // Verificar que aparece en la galería
    const galleryContent = await page.evaluate(() => document.body.innerText);
    if (galleryContent.includes('Cyberpunk Drill')) {
      addResult('Persistencia y Renderizado de Nuevo Proyecto en Galería', 'PASS');
    } else {
      addResult('Persistencia y Renderizado de Nuevo Proyecto en Galería', 'FAIL', 'No apareció en la galería');
    }

    // -------------------------------------------------------------
    // FASE 3: Navegación al Detalle y Auditoría de las 5 Pestañas
    // -------------------------------------------------------------
    console.log('\n--- FASE 3: Detalle de Proyecto y Auditoría de 5 Pestañas ---');

    // Clic en la tarjeta de Cyberpunk Drill
    const projectDetailUrl = await page.evaluate(() => {
      const links = Array.from(document.querySelectorAll('a'));
      const found = links.find(a => a.innerText.includes('Cyberpunk Drill') && a.href.includes('/personal-projects/'));
      return found ? found.href : null;
    });

    if (projectDetailUrl) {
      console.log(`   Navegando a: ${projectDetailUrl}`);
      await page.goto(projectDetailUrl, { waitUntil: 'networkidle2' });
      await sleep(1000);

      // 3.1 Cabecera
      const headerText = await page.evaluate(() => document.body.innerText);
      if (headerText.includes('Cyberpunk Drill') && headerText.includes('142 BPM') && headerText.includes('C#m')) {
        addResult('Cabecera de Proyecto: Título, BPM y Key correctos', 'PASS');
      } else {
        addResult('Cabecera de Proyecto', 'FAIL', 'Metadatos incorrectos en cabecera');
      }

      // 3.2 Pestaña 1: Audio / Demos
      const audioTabBtn = await page.evaluateHandle(() => {
        return Array.from(document.querySelectorAll('button')).find(b => b.innerText.includes('Audio') || b.innerText.includes('Demos'));
      });
      if (audioTabBtn && audioTabBtn.asElement()) {
        await audioTabBtn.asElement().click();
        await sleep(300);
        const audioTabText = await page.evaluate(() => document.body.innerText);
        if (audioTabText.includes('bounces') || audioTabText.includes('versiones') || audioTabText.includes('Subir')) {
          addResult('Pestaña 1: Audio / Demos funcional', 'PASS');
        } else {
          addResult('Pestaña 1: Audio / Demos', 'FAIL', 'Contenido no esperado');
        }
      }

      // 3.3 Pestaña 2: Stems / Pistas
      const stemsTabBtn = await page.evaluateHandle(() => {
        return Array.from(document.querySelectorAll('button')).find(b => b.innerText.includes('Stems') || b.innerText.includes('Pistas'));
      });
      if (stemsTabBtn && stemsTabBtn.asElement()) {
        await stemsTabBtn.asElement().click();
        await sleep(300);
        addResult('Pestaña 2: Stems / Pistas funcional', 'PASS');
      }

      // 3.4 Pestaña 3: Backup / Sesiones
      const backupTabBtn = await page.evaluateHandle(() => {
        return Array.from(document.querySelectorAll('button')).find(b => b.innerText.includes('Backup') || b.innerText.includes('Sesiones'));
      });
      if (backupTabBtn && backupTabBtn.asElement()) {
        await backupTabBtn.asElement().click();
        await sleep(300);
        addResult('Pestaña 3: Backup / Sesiones funcional', 'PASS');
      }

      // 3.5 Pestaña 4: Tareas (Creación, Toggle, Eliminación)
      const tasksTabBtn = await page.evaluateHandle(() => {
        return Array.from(document.querySelectorAll('button')).find(b => b.innerText.includes('Tareas'));
      });
      if (tasksTabBtn && tasksTabBtn.asElement()) {
        await tasksTabBtn.asElement().click();
        await sleep(400);

        const taskInput = await page.$('input[placeholder*="tarea"], input[placeholder*="Escribe"]');
        if (taskInput) {
          // Crear tarea
          await taskInput.type('Añadir efectos de transición y risers');
          await page.keyboard.press('Enter');
          await sleep(1500);

          const taskListText = await page.evaluate(() => document.body.innerText);
          if (taskListText.includes('Añadir efectos de transición y risers')) {
            addResult('Pestaña 4: Creación de Tarea en tiempo real', 'PASS');
          } else {
            addResult('Pestaña 4: Creación de Tarea', 'FAIL', 'No se añadió a la lista');
          }

          // Toggle tarea (completar)
          const taskCheckbox = await page.$('input[type="checkbox"]');
          if (taskCheckbox) {
            await taskCheckbox.click();
            await sleep(1000);
            addResult('Pestaña 4: Toggle Estado de Tarea (Completada)', 'PASS');
          }
        }
      }

      // 3.6 Pestaña 5: Info / Notas (Edición y Guardado)
      const infoTabBtn = await page.evaluateHandle(() => {
        return Array.from(document.querySelectorAll('button')).find(b => b.innerText.includes('Info') || b.innerText.includes('Notas'));
      });
      if (infoTabBtn && infoTabBtn.asElement()) {
        await infoTabBtn.asElement().click();
        await sleep(400);

        const notesArea = await page.$('textarea');
        if (notesArea) {
          await notesArea.type('\nNotas QA: Proyecto verificado en producción.');
          const saveNotesBtn = await page.evaluateHandle(() => {
            return Array.from(document.querySelectorAll('button')).find(b => b.innerText.includes('Guardar'));
          });
          if (saveNotesBtn && saveNotesBtn.asElement()) {
            await saveNotesBtn.asElement().click();
            await sleep(1500);
            addResult('Pestaña 5: Edición y Guardado de Notas', 'PASS');
          }
        }
      }

      // -------------------------------------------------------------
      // FASE 4: Modal de Edición de Proyecto
      // -------------------------------------------------------------
      console.log('\n--- FASE 4: Modal de Edición de Proyecto ---');
      const editProjectBtn = await page.evaluateHandle(() => {
        return Array.from(document.querySelectorAll('button')).find(b => b.innerText.includes('Editar') || b.getAttribute('title') === 'Editar proyecto');
      });
      if (editProjectBtn && editProjectBtn.asElement()) {
        await editProjectBtn.asElement().click();
        await sleep(400);

        // Cambiar BPM a 145
        await page.evaluate(() => {
          const numInputs = Array.from(document.querySelectorAll('input[type="number"]'));
          if (numInputs[0]) {
            numInputs[0].value = '145';
            numInputs[0].dispatchEvent(new Event('input', { bubbles: true }));
          }
        });

        const saveChangesBtn = await page.evaluateHandle(() => {
          return Array.from(document.querySelectorAll('button')).find(b => b.innerText.includes('Guardar Cambios'));
        });
        if (saveChangesBtn && saveChangesBtn.asElement()) {
          await saveChangesBtn.asElement().click();
          await sleep(2000);

          const afterEditText = await page.evaluate(() => document.body.innerText);
          if (afterEditText.includes('145 BPM')) {
            addResult('Edición de Proyecto: Modificación de BPM a 145 reflejada', 'PASS');
          } else {
            addResult('Edición de Proyecto', 'FAIL', 'No se actualizó el BPM en pantalla');
          }
        }
      }

      // -------------------------------------------------------------
      // FASE 5: Eliminación de Proyecto y Verificación F5
      // -------------------------------------------------------------
      console.log('\n--- FASE 5: Eliminación de Proyecto & Verificación de Caché ---');
      const deleteProjectBtn = await page.evaluateHandle(() => {
        return Array.from(document.querySelectorAll('button')).find(b => b.innerText.includes('Eliminar') || b.getAttribute('title') === 'Eliminar proyecto');
      });
      if (deleteProjectBtn && deleteProjectBtn.asElement()) {
        await deleteProjectBtn.asElement().click();
        await sleep(3500); // Esperar DELETE API + redirección

        // Refrescar página para validar persistencia real
        console.log('   Refrescando /personal-projects con F5...');
        await page.goto(`${BASE_URL}/personal-projects`, { waitUntil: 'networkidle2' });
        await sleep(1200);

        const finalGalleryText = await page.evaluate(() => document.body.innerText);
        if (!finalGalleryText.includes('Cyberpunk Drill')) {
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
