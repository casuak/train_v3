const previous = new WeakMap<Element, string>();

// Keep live HUD controls attached while their labels and meters change.
export function updateHTML(target: Element, markup: string) {
  if (previous.get(target) === markup) return;
  const template = document.createElement('template');
  template.innerHTML = markup;
  patchChildren(target, template.content);
  previous.set(target, markup);
}

function patchChildren(target: Node, source: Node) {
  const wanted = Array.from(source.childNodes);
  for (let i = 0; i < wanted.length; i++) {
    const next = wanted[i],
      current = target.childNodes[i];
    if (!current) {
      target.appendChild(next.cloneNode(true));
    } else if (current.nodeType !== next.nodeType || current.nodeName !== next.nodeName) {
      target.replaceChild(next.cloneNode(true), current);
    } else if (current instanceof Element && next instanceof Element) {
      for (const attr of Array.from(current.attributes))
        if (!next.hasAttribute(attr.name)) current.removeAttribute(attr.name);
      for (const attr of Array.from(next.attributes))
        if (current.getAttribute(attr.name) !== attr.value)
          current.setAttribute(attr.name, attr.value);
      patchChildren(current, next);
    } else if (current.nodeValue !== next.nodeValue) {
      current.nodeValue = next.nodeValue;
    }
  }
  while (target.childNodes.length > wanted.length) target.lastChild!.remove();
}
