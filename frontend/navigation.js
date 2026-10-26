export function exclusiveNavigation(doc) {
  const menus = [...doc.querySelectorAll('details.nav-dropdown')];
  for (const menu of menus) menu.addEventListener('toggle', () => {
    if (menu.open) for (const other of menus) if (other !== menu) other.open = false;
  });
  doc.addEventListener('click', event => {
    if (!event.target.closest('details.nav-dropdown') || event.target.closest('details.nav-dropdown a')) for (const menu of menus) menu.open = false;
  });
  doc.addEventListener('keydown', event => { if (event.key === 'Escape') for (const menu of menus) menu.open = false; });
}
