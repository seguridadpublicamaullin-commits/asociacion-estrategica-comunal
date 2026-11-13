const normalize = (text) => text.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase();
const stop = new Set('que quien cual como puedo podemos para del las los una uno con por donde cuando desde hacer debo quiero tengo sale esta este esto error problema sistema sec'.split(' '));
const tokenize = (text) => normalize(text).match(/[a-z0-9_]{2,}/g)?.filter(word => !stop.has(word)) ?? [];
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
  let passages;
  const show = (message) => { const p = document.createElement('p'); p.textContent = message; answer.replaceChildren(p); };
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (!question.value.trim()) return;
    show('Buscando en la guía…');
    try {
      if (!passages) {
        const response = await fetch('guia.md');
        if (!response.ok) throw new Error('No se pudo abrir la guía.');
        passages = parseGuide(await response.text());
      }
      const matches = searchGuide(passages, question.value);
      if (!matches.length) {
        show('No encontré un paso verificable. Indique el módulo, la etapa de instalación y el mensaje exacto del error.');
        return;
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
    } catch {
      show('No se pudo cargar la guía. Intente otra vez o descárguela desde el enlace inferior.');
    }
  });
  for (const button of form.querySelectorAll('button[type=button]')) {
    button.addEventListener('click', () => { question.value = button.textContent; form.requestSubmit(); });
  }
}
