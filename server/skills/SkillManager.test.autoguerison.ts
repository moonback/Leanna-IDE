import { SkillManager } from './SkillManager';

// Test basique pour vérifier que l'analyse des alternatives fonctionne
async function testAutoGuerison() {
  console.log('[Test Auto-Guerison] Démarrage des tests...\n');

  try {
    // Créer une instance du SkillManager
    const skillManager = new SkillManager();

    // Test 1: Analyse proactive d'un outil
    console.log('[Test 1] Analyse proactive d\'un outil git...');
    const analysis1 = await skillManager.analyzeToolProactively('git_commit', 'Test analyse proactive');
    console.log('Résultats:', {
      errorType: analysis1.errorType,
      proposalCount: analysis1.proposals.length,
    });
    analysis1.proposals.forEach((p, i) => {
      console.log(`  Proposition ${i + 1}: [${p.type}] ${p.description} (confiance: ${p.confidence})`);
    });

    // Test 2: Obtenir des alternatives pour un outil
    console.log('\n[Test 2] Obtenir des alternatives pour un outil...');
    const alternatives = await skillManager.getToolAlternatives('read_file');
    console.log(`Trouvé ${alternatives.length} alternatives:`);
    alternatives.forEach((alt, i) => {
      console.log(`  Alternative ${i + 1}: [${alt.type}] ${alt.description}`);
    });

    // Test 3: Simulation d'une erreur et analyse
    console.log('\n[Test 3] Simulation d\'une erreur TOOL_NOT_FOUND...');
    const mockError = new Error('Outil inconnu: nonexistent_tool. Aucune skill enregistrée ne gère cet outil.');
    const analysis3 = await skillManager.analyzeToolErrorAndProposeAlternatives('nonexistent_tool', mockError);
    console.log('Type d\'erreur détecté:', analysis3.errorType);
    console.log('Nombre de propositions:', analysis3.proposals.length);
    analysis3.proposals.forEach((p, i) => {
      console.log(`  Proposition ${i + 1}: [${p.type}] ${p.description}`);
    });

    // Test 4: Récupérer l'historique des analyses
    console.log('\n[Test 4] Récupération de l\'historique des analyses...');
    const history = skillManager.getToolErrorAnalyses();
    console.log(`Historique contient ${history.length} analyses`);

    console.log('\n[Test Auto-Guerison] ✅ Tous les tests ont passé !');

  } catch (error) {
    console.error('[Test Auto-Guerison] ❌ Erreur:', error);
    process.exit(1);
  }
}

// Exécuter les tests si ce fichier est lancé directement
if (require.main === module) {
  testAutoGuerison().catch(console.error);
}

export { testAutoGuerison };