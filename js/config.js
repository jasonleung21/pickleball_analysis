/*
 * What can be tagged on a rally. The details panel and the CSV export are built from
 * this list, so adding a metric usually starts here:
 *   1. add a field (or an option) below
 *   2. compute it in js/stats.js
 *
 * Field types:
 *   (default) single-choice chips from `options`; tap the active chip again to clear
 *   'player'  — one of the players on court ("A0", "A1", "B0", "B1")
 *   'count'   — a small number (e.g. shots in the rally)
 *   'text'    — free text
 * `when(details)` hides a field unless it applies.
 */
(function (root) {
  'use strict';

  const CHART_GROUPS = [
    {
      title: 'How the rally ended',
      fields: [
        {
          key: 'ending',
          label: 'Ended with',
          options: [
            { v: 'winner', label: 'Winner' },
            { v: 'ue', label: 'Unforced error' },
            { v: 'fe', label: 'Forced error' },
          ],
        },
        { key: 'by', label: 'Last shot by', type: 'player' },
        {
          key: 'shot',
          label: 'Last shot',
          options: [
            { v: 'serve', label: 'Serve' },
            { v: 'return', label: 'Return' },
            { v: 'third', label: '3rd shot' },
            { v: 'dink', label: 'Dink' },
            { v: 'drop', label: 'Drop / reset' },
            { v: 'drive', label: 'Drive' },
            { v: 'volley', label: 'Volley' },
            { v: 'lob', label: 'Lob' },
            { v: 'overhead', label: 'Overhead' },
            { v: 'atp', label: 'ATP / Erne' },
            { v: 'other', label: 'Other' },
          ],
        },
        {
          key: 'miss',
          label: 'Error went',
          when: (d) => d.ending === 'ue' || d.ending === 'fe',
          options: [
            { v: 'net', label: 'Into the net' },
            { v: 'long', label: 'Out long' },
            { v: 'wide', label: 'Out wide' },
            { v: 'nvz', label: 'Kitchen fault' },
          ],
        },
      ],
    },
    {
      title: '3rd shot (serving team)',
      fields: [
        {
          key: 'third',
          label: 'Type',
          options: [
            { v: 'drop', label: 'Drop' },
            { v: 'drive', label: 'Drive' },
            { v: 'lob', label: 'Lob' },
          ],
        },
        {
          key: 'thirdLand',
          label: 'Landed',
          options: [
            { v: 'kitchen', label: 'In the kitchen' },
            { v: 'short', label: 'Short (transition zone)' },
            { v: 'deep', label: 'Deep' },
            { v: 'net', label: 'Net' },
            { v: 'out', label: 'Out' },
          ],
        },
      ],
    },
    {
      title: 'Rally',
      fields: [
        { key: 'shots', label: 'Shots in rally', type: 'count' },
        { key: 'note', label: 'Note', type: 'text' },
      ],
    },
  ];

  const FIELDS = [];
  CHART_GROUPS.forEach((g) => g.fields.forEach((f) => FIELDS.push(f)));

  function optionLabel(key, v) {
    const f = FIELDS.find((x) => x.key === key);
    if (!f || !f.options) return v;
    const o = f.options.find((x) => x.v === v);
    return o ? o.label : v;
  }

  const api = { CHART_GROUPS, FIELDS, optionLabel };
  root.PBA = root.PBA || {};
  root.PBA.config = api;
  if (typeof module === 'object' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
