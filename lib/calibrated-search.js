// The numerical model's observations are separate from panel/variation searches.
export async function analyseCalibratedPosition(engine, {fen, history, played, settings, calibration, onProgress}) {
  const build = engine.buildKey || settings.enginePath, sf19 = build === 'sf19lite';
  const major = ['sf19', 'sf19lite'].includes(build) ? 19 : 18;
  if (engine.identity && !new RegExp(`^Stockfish ${major}\\b`).test(engine.identity)) throw Error('Scoring engine identity differs');
  const common = {'UCI_ShowWDL': true, UCI_LimitStrength: false, UCI_Chess960: false};
  const primaryOptions = {...common, Hash: sf19 ? 32 : settings.engineHash, 'Skill Level': sf19 ? 20 : settings.engineSkill};
  await engine.setOptions(primaryOptions);
  const budget = sf19 ? {kind: 'nodes', value: 20000} : {kind: 'depth', value: settings.engineDepth};
  const lines = Math.max(['sf19','sf19lite'].includes(build) ? 2 : 1, settings.classifyLines || 1);
  const options = {cold: true, requireExact: true, budget};
  const exactSearch = async (depth, count, progress, config) => {
    try { return await engine.analyse(fen, depth, count, history, progress, config); }
    catch (error) {
      if (config.searchMove || !/^[a-h][1-8][a-h][1-8][qrbn]?$/.test(error.scoringMove || '')) throw error;
      const observation = await engine.analyse(fen, depth, 1, history, null, {...config, searchMove: error.scoringMove});
      observation.exactRecovery = true;
      return observation;
    }
  };
  const root = await exactSearch(settings.engineDepth, lines, onProgress, options);
  const standardStart = history?.initialFen === 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
  const compatible = build === 'nnue' && standardStart && settings.engineDepth === 16 && settings.engineHash === 16 && settings.engineSkill === 20 && lines === 1;
  root.calibration = {version: calibration.version, build, nodes: sf19 ? 20000 : null,
    contextVersion: null,
    qualityVersion: compatible ? calibration.quality.candidateVersion : null};
  if (!played) return root;
  const actual = root.bestmove === played ? root : await engine.analyse(fen, settings.engineDepth, 1, history, null, {...options, searchMove: played});
  root.playedScore = actual.score;
  if(actual.stoppedEarly)root.playedSearchLimited={depth:actual.lines?.[0]?.depth??null};
  return root;
}
