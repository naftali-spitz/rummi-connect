export type Language = 'en' | 'he';

type Vars = Record<string, string | number>;

const strings = {
  en: {
    yourName: 'Your name', playerName: 'Player name', createGame: 'Create game', orJoin: 'or join a table', roomCode: 'Room code', playingDevice: 'Playing device', tvDisplay: 'TV / display',
    tagline: 'A live tabletop game for the people in the room.', language: 'Language', english: 'English', hebrew: 'עברית', room: 'ROOM', players: 'Players', devices: 'devices', playerCount: 'players',
    computer: 'Computer', thisDevice: 'This device', remoteDevice: 'Remote device', anotherPlayer: 'Another player on this device', add: 'Add', easyAi: 'Easy AI', normalAi: 'Normal AI', hardAi: 'Hard AI', expertAi: 'Expert AI', addComputer: '+ Computer',
    joinAnother: 'Join from another device', roomCodeLabel: 'Room code {code}', joinHelp: 'Open the address on the same network and enter the room code.', startGame: 'Start game', waitingHost: 'Waiting for the host to start…',
    pool: 'Pool', firstMeld: 'Play your first meld here', newMeld: 'New meld', turn: "{name}'s turn", table: 'Table', undo: 'Undo', redo: 'Redo', reset: 'Reset', organize: 'Organize', color: 'Color', draw: 'Draw', done: 'Done', yourRack: 'Your rack',
    splitAfter: 'Split after', cancel: 'Cancel', passDevice: 'Pass the device to', rackHidden: "The rack stays hidden until they're ready.", imReady: "I'm ready", nothingUndo: 'Nothing to undo', nothingRedo: 'Nothing to redo', resetFail: 'Unable to reset', organizeFail: 'Unable to organize', sortFail: 'Unable to sort', drawFail: 'Unable to draw', invalidTable: 'The table is not valid yet', moveUnavailable: 'That move is not available',
    settings: 'Settings', theme: 'Theme', classic: 'Classic Tabletop', soft: 'Soft Modern', minimal: 'Minimal Premium', playful: 'Contemporary Playful', sound: 'Sound', haptics: 'Haptics', colorBlind: 'Color-blind tile mode', colorBlindHelp: 'Adds stronger shape and border cues on this device.', fullscreen: 'Fullscreen', game: 'Game', restartGame: 'Restart game', newGame: 'Start new game', restartConfirm: 'Restart the game now? All tiles will be reshuffled and redealt to the same players.', newGameConfirm: 'End this game and return everyone to the lobby?', restartFail: 'Unable to restart the game', newGameFail: 'Unable to return to the lobby', gameHelp: 'Restart keeps the same players and deals fresh tiles. Start new game ends the current round and returns everyone to the lobby so players can be changed.',
    gameOver: 'Game over', winsTable: 'wins the table', finalScores: 'Final scores', playAgain: 'Play again', leaveRoom: 'Leave room', removePlayer: 'Remove {name}'
  },
  he: {
    yourName: 'השם שלך', playerName: 'שם שחקן', createGame: 'יצירת משחק', orJoin: 'או הצטרפות לשולחן', roomCode: 'קוד חדר', playingDevice: 'מכשיר שחקן', tvDisplay: 'טלוויזיה / תצוגה',
    tagline: 'משחק שולחן חי לכל מי שנמצא בחדר.', language: 'שפה', english: 'English', hebrew: 'עברית', room: 'חדר', players: 'שחקנים', devices: 'מכשירים', playerCount: 'שחקנים',
    computer: 'מחשב', thisDevice: 'המכשיר הזה', remoteDevice: 'מכשיר אחר', anotherPlayer: 'שחקן נוסף במכשיר הזה', add: 'הוספה', easyAi: 'מחשב קל', normalAi: 'מחשב רגיל', hardAi: 'מחשב קשה', expertAi: 'מחשב מומחה', addComputer: '+ מחשב',
    joinAnother: 'הצטרפות ממכשיר נוסף', roomCodeLabel: 'קוד חדר {code}', joinHelp: 'פתחו את הכתובת באותה רשת והזינו את קוד החדר.', startGame: 'התחלת משחק', waitingHost: 'ממתינים למארח להתחיל…',
    pool: 'קופה', firstMeld: 'הניחו כאן את הסדרה הראשונה', newMeld: 'סדרה חדשה', turn: 'התור של {name}', table: 'שולחן', undo: 'ביטול', redo: 'ביצוע מחדש', reset: 'איפוס תור', organize: 'סידור שולחן', color: 'צבע', draw: 'משיכה', done: 'סיום תור', yourRack: 'המעמד שלך',
    splitAfter: 'פיצול אחרי', cancel: 'ביטול', passDevice: 'העבירו את המכשיר אל', rackHidden: 'המעמד נשאר מוסתר עד שהשחקן מוכן.', imReady: 'אני מוכן', nothingUndo: 'אין פעולה לבטל', nothingRedo: 'אין פעולה לבצע מחדש', resetFail: 'לא ניתן לאפס את התור', organizeFail: 'לא ניתן לסדר את השולחן', sortFail: 'לא ניתן למיין', drawFail: 'לא ניתן למשוך', invalidTable: 'השולחן עדיין אינו חוקי', moveUnavailable: 'לא ניתן לבצע את המהלך הזה',
    settings: 'הגדרות', theme: 'ערכת נושא', classic: 'שולחן קלאסי', soft: 'מודרני רך', minimal: 'מינימלי', playful: 'צבעוני', sound: 'צלילים', haptics: 'רטט', colorBlind: 'מצב עיוורון צבעים', colorBlindHelp: 'מוסיף סימנים וגבולות מובחנים יותר במכשיר הזה.', fullscreen: 'מסך מלא', game: 'משחק', restartGame: 'התחלה מחדש', newGame: 'משחק חדש', restartConfirm: 'להתחיל מחדש עכשיו? כל האבנים יעורבבו ויחולקו מחדש לאותם שחקנים.', newGameConfirm: 'לסיים את המשחק ולחזור ללובי?', restartFail: 'לא ניתן להתחיל מחדש', newGameFail: 'לא ניתן לחזור ללובי', gameHelp: 'התחלה מחדש משאירה את אותם שחקנים ומחלקת אבנים חדשות. משחק חדש מחזיר ללובי כדי לשנות שחקנים.',
    gameOver: 'המשחק הסתיים', winsTable: 'ניצח במשחק', finalScores: 'תוצאות סופיות', playAgain: 'משחק נוסף', leaveRoom: 'יציאה מהחדר', removePlayer: 'הסרת {name}'
  }
} as const;

export type TranslationKey = keyof typeof strings.en;

export function t(language: Language, key: TranslationKey, vars: Vars = {}): string {
  let value: string = strings[language][key] ?? strings.en[key];
  for (const [name, replacement] of Object.entries(vars)) value = value.replaceAll(`{${name}}`, String(replacement));
  return value;
}
