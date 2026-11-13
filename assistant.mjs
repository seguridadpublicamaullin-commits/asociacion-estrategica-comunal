const normalize = (text) => text.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase();
const stop = new Set('que quien cual como puedo podemos para del las los una uno con por donde cuando desde hacer debo quiero tengo sale esta este esto error problema sistema sec'.split(' '));
const tokenize = (text) => normalize(text).match(/[a-z0-9_]{2,}/g)?.filter(word => !stop.has(word)) ?? [];
const overviewQuery = /\b(?:conect\w*|configur\w*|integr\w*|instal\w*)\s+(?:el\s+|la\s+)?(?:todo|sistema(?:\s+completo)?)\b|\b(?:desde cero|por donde empiezo|primeros pasos|ruta de implementacion|guia completa)\b/;
const shortcuts = [
  [/failed to fetch|cors/, 'La web muestra'],
  [/\bhealth\b.*(falla|caid|no responde)|api no (abre|responde)/, 'La API no abre'],
  [/primer admin|crear.*administrador|bootstrap/, 'Terminal 2'],
  [/client_id|aadsts|uri de retorno|redirect/, 'Si Microsoft rechaza'],
  [/cero registros|tablero.*(vacio|cero|sin datos)/, 'Entré, pero'],
  [/npm\.ps1|puerto 3014.*ocupado/, 'Si no inicia'],
  [/operador.*(ip|puesto)|ip.*operador/, 'Un operador entra'],
  [/planillas|excel|microsoft graph/, 'Microsoft para planillas']
];

export function parseGuide(markdown) {
  let chapter = '';
  let title = '';
  let body = [];
  let inCode = false;
  const passages = [];
  const flush = () => {
    const content = body.join('\n').trim();
    if (content) passages.push({chapter, title, content});
    body = [];
  };
  for (const line of markdown.split(/\r?\n/)) {
    if (line.startsWith('```')) { inCode = !inCode; continue; }
    if (!inCode && line.startsWith('# ')) {
      flush(); chapter = line.slice(2); title = chapter;
    } else if (!inCode && line.startsWith('## ')) {
      flush(); title = line.slice(3).replaceAll('`', '');
    } else {
      body.push(inCode ? line : line.replaceAll('**', '').replaceAll('`', ''));
    }
  }
  flush();
  return passages;
}

export function searchGuide(passages, question) {
  const terms = [...new Set(tokenize(question))];
  const query = normalize(question);
  if (overviewQuery.test(query)) {
    return passages.filter(({ chapter, title }) => chapter.startsWith('01.') &&
      ['Elija la prueba según su objetivo', 'Índice de trabajo'].includes(title));
  }
  const target = shortcuts.find(([pattern]) => pattern.test(query))?.[1];
  return passages.map(passage => {
    const heading = new Set(tokenize(passage.title));
    const chapter = new Set(tokenize(passage.chapter));
    const content = new Set(tokenize(passage.content));
    let score = terms.reduce((sum, term) => sum + (heading.has(term) ? 6 : chapter.has(term) ? 3 : content.has(term) ? 1 : 0), 0);
    if (target && (passage.title.startsWith(target) || passage.chapter.includes(target))) score += 25;
    return {passage, score};
  }).filter(item => item.score >= 2).sort((a, b) => b.score - a.score).slice(0, 2).map(item => item.passage);
}

if (typeof document !== 'undefined') {
  const form = document.querySelector('#search');
  const question = document.querySelector('#question');
  const answer = document.querySelector('#answer');
  const localAI = document.querySelector('#local-ai');
  const history = [];
  let passages;
  const show = (message) => { const p = document.createElement('p'); p.textContent = message; answer.replaceChildren(p); };
  async function askModel(text, matches) {
    const { answerLocally } = await import('./ia-local.mjs?v=3');
    const result = await answerLocally(text, history, matches, show);
    const card = document.createElement('article');
    const body = document.createElement('p');
    body.className = 'answer';
    body.textContent = result.answer;
    card.append(body);
    for (const { page, title } of result.references) {
      if (!Number.isInteger(page) || page < 2 || page > 14) continue;
      const link = document.createElement('a');
      link.href = 'guia-tecnica.pdf#page=' + page;
      link.textContent = 'Guía técnica · pág. ' + page + ' · ' + title;
      card.append(link, document.createElement('br'));
    }
    answer.replaceChildren(card);
    history.push({ role: 'user', text }, { role: 'assistant', text: result.answer });
    if (history.length > 4) history.splice(0, history.length - 4);
  }
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const text = question.value.trim();
    const submit = form.querySelector('button[type=submit]');
    if (!text || submit.disabled) return;
    submit.disabled = true;
    show('Buscando en la guía…');
    try {
      if (!passages) {
        const response = await fetch('guia.md');
        if (!response.ok) throw new Error('No se pudo abrir la guía.');
        passages = parseGuide(await response.text());
      }
      let matches = searchGuide(passages, text);
      if (!matches.length && localAI.checked && history.length) {
        matches = searchGuide(passages, history.at(-2).text);
      }
      if (!matches.length) {
        show('No encontré una sección para esa consulta. Si está empezando, elija «¿Cómo conecto todo?». Si ya está instalando, indique el componente que quiere conectar o el mensaje de error.');
        return;
      }
      let fallback;
      if (localAI.checked) {
        try {
          await askModel(text, matches);
          return;
        } catch (error) {
          console.warn('Modo de IA local:', error?.message ?? String(error));
          fallback = error.code === 'WEBGPU'
            ? 'Este navegador o equipo no ofrece WebGPU. Aquí están los pasos de la guía.'
            : 'La IA local no pudo preparar una respuesta respaldada. Aquí están los pasos de la guía.';
        }
      }
      answer.replaceChildren(...matches.map(({title, chapter, content}) => {
        const card = document.createElement('article');
        const heading = document.createElement('h2');
        heading.textContent = title;
        const reference = document.createElement('a');
        reference.href = 'guia-tecnica.pdf#page=' + (Number(chapter.slice(0, 2)) + 1);
        reference.textContent = 'Guía técnica · ' + chapter;
        const body = document.createElement('p');
        body.className = 'answer';
        body.textContent = content;
        card.append(heading, body, reference);
        return card;
      }));
      if (fallback) {
        const notice = document.createElement('p');
        notice.textContent = fallback;
        answer.prepend(notice);
      }
    } catch {
      show('No se pudo cargar la guía. Intente otra vez o descárguela desde el enlace inferior.');
    } finally {
      submit.disabled = false;
    }
  });
  for (const button of form.querySelectorAll('button[type=button]')) {
    button.addEventListener('click', () => { question.value = button.textContent; form.requestSubmit(); });
  }
}
