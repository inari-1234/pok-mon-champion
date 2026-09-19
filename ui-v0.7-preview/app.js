(() => {
  const screens = [...document.querySelectorAll(".screen")];
  const navButtons = [...document.querySelectorAll("[data-nav]")];

  function showScreen(name) {
    screens.forEach(s => s.classList.toggle("active", s.dataset.screen === name));
    navButtons.forEach(b => b.classList.toggle("active", b.dataset.nav === name));
    window.scrollTo({top:0, behavior:"smooth"});
  }

  navButtons.forEach(b => b.addEventListener("click", () => showScreen(b.dataset.nav)));
  document.querySelectorAll("[data-go]").forEach(b => b.addEventListener("click", () => showScreen(b.dataset.go)));

  document.querySelectorAll("[data-tabs]").forEach(group => {
    group.addEventListener("click", e => {
      const button = e.target.closest("[data-tab]");
      if (!button) return;
      const container = group.parentElement;
      group.querySelectorAll("[data-tab]").forEach(b => b.classList.remove("active"));
      button.classList.add("active");
      container.querySelectorAll(":scope > [data-tab-panel]").forEach(p => p.classList.toggle("active", p.dataset.tabPanel === button.dataset.tab));
    });
  });

  document.querySelectorAll(".format-switch").forEach(group => {
    group.addEventListener("click", e => {
      const button = e.target.closest("button");
      if (!button) return;
      group.querySelectorAll("button").forEach(b => b.classList.remove("active"));
      button.classList.add("active");
    });
  });

  const picker = document.getElementById("pokemonPicker");
  document.getElementById("openPicker")?.addEventListener("click", () => picker.showModal());
  document.querySelectorAll(".close-dialog").forEach(b => b.addEventListener("click", () => picker.close()));

  const settings = document.getElementById("settingsDialog");
  document.getElementById("openSettings")?.addEventListener("click", () => settings.showModal());
  document.querySelectorAll(".close-settings").forEach(b => b.addEventListener("click", () => settings.close()));

  [picker, settings].forEach(dialog => {
    dialog.addEventListener("click", e => {
      if (e.target === dialog) dialog.close();
    });
  });

  document.querySelectorAll(".filter-chips").forEach(group => {
    group.addEventListener("click", e => {
      const button = e.target.closest("button");
      if (!button) return;
      group.querySelectorAll("button").forEach(b => b.classList.remove("active"));
      button.classList.add("active");
    });
  });

  document.querySelectorAll(".result-select").forEach(group => {
    group.addEventListener("click", e => {
      const button = e.target.closest("button");
      if (!button) return;
      e.preventDefault();
      group.querySelectorAll("button").forEach(b => b.classList.remove("selected"));
      button.classList.add("selected");
    });
  });
})();