function n(t){if(t==null||t==="")return"—";const r=String(t).trim();return/^\d+$/.test(r)?r.padStart(4,"0"):r}export{n as i};
