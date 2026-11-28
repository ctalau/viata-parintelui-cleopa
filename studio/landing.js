export function renderLibrary(library) {
  for (const { group, entries } of library) {
    const article = document.createElement('article');
    const heading = document.createElement('h3');
    heading.textContent = group;
    const list = document.createElement('ul');
    for (const { name, link } of entries) {
      const item = document.createElement('li');
      const anchor = document.createElement('a');
      anchor.href = link;
      anchor.textContent = name;
      item.append(anchor);
      list.append(item);
    }
    article.append(heading, list);
    document.querySelector('#library-items').append(article);
  }
}
