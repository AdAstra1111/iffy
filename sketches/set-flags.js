/* Paste this into your browser console after logging in at localhost:8080 */

const flags = {
  NEW_IFFY_SHELL: true,
  NEW_WORKSPACE_DEVELOP: true,
  NEW_WORKSPACE_VISUALIZE: true,
  NEW_WORKSPACE_CAST: true,
  NEW_WORKSPACE_PRODUCE: true,
  NEW_WORKSPACE_PACKAGE: true,
  NEW_WORKSPACE_DELIVER: true,
  NEW_INTELLIGENCE_LAYER: true,
  NEW_EXPERT_MODE: true,
  NEW_SYSTEM_MODE: true
};

localStorage.setItem('iffy_flags', JSON.stringify(flags));
console.log('✅ Flags set. Refresh to see the new shell.');
// Then navigate to: localhost:8080/projects/{YOUR_PROJECT_ID}/develop