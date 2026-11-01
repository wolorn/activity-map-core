window.ACTIVITY_SOURCE = {
  id: 'fixture',
  openLabel: 'Ouvrir',
  activityUrl: function (id) { return 'https://example.org/a/' + encodeURIComponent(id); },
  loadFiles: async function () { return { dataset: { activities: [] }, errors: [] }; }
};
