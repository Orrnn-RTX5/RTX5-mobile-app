import type { LanguageCode } from '../../state/userPreferences';
import type { Dictionary } from '../translations';

// Trade flow screens (modify/close/close-by/bulk/one-click terms) chrome.
export const tradeScreensSurface: Record<LanguageCode, Dictionary> = {
  en: {},
  es: {
    'Go back': 'Volver',
    'Loading position...': 'Cargando posicion...',
    at: 'a',
    'Loading symbols...': 'Cargando simbolos...',
    'No symbols available': 'No hay simbolos disponibles',
    Viewing: 'Viendo',
    'No open position': 'Sin posicion abierta',
    Selected: 'Seleccionado',
    'live view. No open position on this symbol.': 'vista en vivo. Sin posicion abierta en este simbolo.',
    'Not set': 'Sin definir',
    Distance: 'Distancia',
    'Est. Loss': 'Perdida est.',
    'Est. Profit': 'Beneficio est.',
    pts: 'pts',
    'SL/TP must be at least {points} points away from the market price. Orders are executed by the broker.':
      'El SL/TP debe estar al menos a {points} puntos del precio de mercado. Las ordenes las ejecuta el broker.',
    'No connection': 'Sin conexion',
    'Stop Loss must be at least {points} points below the current Bid ({price}) for a buy position.':
      'El Stop Loss debe estar al menos {points} puntos por debajo del Bid actual ({price}) para una posicion de compra.',
    'Stop Loss must be at least {points} points above the current Ask ({price}) for a sell position.':
      'El Stop Loss debe estar al menos {points} puntos por encima del Ask actual ({price}) para una posicion de venta.',
    'Take Profit must be at least {points} points above the current Bid ({price}) for a buy position.':
      'El Take Profit debe estar al menos {points} puntos por encima del Bid actual ({price}) para una posicion de compra.',
    'Take Profit must be at least {points} points below the current Ask ({price}) for a sell position.':
      'El Take Profit debe estar al menos {points} puntos por debajo del Ask actual ({price}) para una posicion de venta.',
    'Authentication Error': 'Error de autenticacion',
    'The app does not have a valid local trading session. Log in again before modifying the position.':
      'La app no tiene una sesion de trading local valida. Inicie sesion de nuevo antes de modificar la posicion.',
    'Invalid Stop Levels': 'Niveles stop no validos',
    'SL/TP Not Applied': 'SL/TP no aplicado',
    'The backend accepted the modify request but did not confirm the requested Stop Loss or Take Profit values. Please refresh positions and try again.':
      'El backend acepto la solicitud de modificacion pero no confirmo los valores de Stop Loss o Take Profit solicitados. Actualice las posiciones e intentelo de nuevo.',
    'Search symbols...': 'Buscar simbolos...',
    'Review and confirm closing order': 'Revise y confirme la orden de cierre',
    'Open Price': 'Precio de apertura',
    'Current Price': 'Precio actual',
    'Real-time P/L': 'P/L en tiempo real',
    'Order Ticket': 'Ticket de la orden',
    'Close order submitted. Position closed successfully.': 'Orden de cierre enviada. Posicion cerrada correctamente.',
    'Position Error': 'Error de posicion',
    'The position ticket is still loading. Return to Trade and select the position again.':
      'El ticket de la posicion aun se esta cargando. Vuelva a Operar y seleccione la posicion de nuevo.',
    'The app does not have a valid local trading session. Log in again before closing a position.':
      'La app no tiene una sesion de trading local valida. Inicie sesion de nuevo antes de cerrar una posicion.',
    'Select a matching position to pair-close.': 'Seleccione una posicion opuesta para el cierre cruzado.',
    'Source Position': 'Posicion de origen',
    'No matching positions available for close-by.': 'No hay posiciones compatibles para el cierre cruzado.',
    'Close-by request completed successfully.': 'Solicitud de cierre cruzado completada correctamente.',
    'Send Close By Request': 'Enviar solicitud de Cerrar por',
    'The app does not have a valid local trading session. Log in again before using Close By.':
      'La app no tiene una sesion de trading local valida. Inicie sesion de nuevo antes de usar Cerrar por.',
    'Close Sell Positions': 'Cerrar posiciones de venta',
    'Bulk Operation': 'Operacion en lote',
    'Close {symbol} Positions': 'Cerrar posiciones {symbol}',
    'Affected Positions': 'Posiciones afectadas',
    'Total Exposure P/L': 'P/L de exposicion total',
    'Active Exposures': 'Exposiciones activas',
    'Net Exposure (USD)': 'Exposicion neta (USD)',
    'No positions match this operation.': 'Ninguna posicion coincide con esta operacion.',
    'Bulk operation simulated and queued for backend execution.': 'Operacion en lote simulada y en cola para ejecucion en el backend.',
    'Execute Bulk Operation': 'Ejecutar operacion en lote',
    'You are about to activate One Click Trading mode. By clicking Accept the terms below, you acknowledge and agree to bound order submission behavior.':
      'Esta a punto de activar el modo Trading con un clic. Al aceptar los terminos siguientes, reconoce y acepta el comportamiento vinculante de envio de ordenes.',
    'There will be no subsequent confirmation prompt for one-click order actions once activated.':
      'No habra ninguna confirmacion posterior para las acciones de ordenes con un clic una vez activado.',
    'You agree to accept all risks associated with one-click trading mode, including errors or omissions in submitting orders.':
      'Acepta todos los riesgos asociados al modo de trading con un clic, incluidos errores u omisiones al enviar ordenes.',
    'I Accept these Terms and Conditions': 'Acepto estos terminos y condiciones',
    Accept: 'Aceptar',
  },
  pt: {
    'Go back': 'Voltar',
    'Loading position...': 'Carregando posicao...',
    at: 'a',
    'Loading symbols...': 'Carregando simbolos...',
    'No symbols available': 'Nenhum simbolo disponivel',
    Viewing: 'Visualizando',
    'No open position': 'Sem posicao aberta',
    Selected: 'Selecionado',
    'live view. No open position on this symbol.': 'visao ao vivo. Sem posicao aberta neste simbolo.',
    'Not set': 'Nao definido',
    Distance: 'Distancia',
    'Est. Loss': 'Perda est.',
    'Est. Profit': 'Lucro est.',
    pts: 'pts',
    'SL/TP must be at least {points} points away from the market price. Orders are executed by the broker.':
      'O SL/TP deve ficar a pelo menos {points} pontos do preco de mercado. As ordens sao executadas pela corretora.',
    'No connection': 'Sem conexao',
    'Stop Loss must be at least {points} points below the current Bid ({price}) for a buy position.':
      'O Stop Loss deve ficar pelo menos {points} pontos abaixo do Bid atual ({price}) para uma posicao de compra.',
    'Stop Loss must be at least {points} points above the current Ask ({price}) for a sell position.':
      'O Stop Loss deve ficar pelo menos {points} pontos acima do Ask atual ({price}) para uma posicao de venda.',
    'Take Profit must be at least {points} points above the current Bid ({price}) for a buy position.':
      'O Take Profit deve ficar pelo menos {points} pontos acima do Bid atual ({price}) para uma posicao de compra.',
    'Take Profit must be at least {points} points below the current Ask ({price}) for a sell position.':
      'O Take Profit deve ficar pelo menos {points} pontos abaixo do Ask atual ({price}) para uma posicao de venda.',
    'Authentication Error': 'Erro de autenticacao',
    'The app does not have a valid local trading session. Log in again before modifying the position.':
      'O app nao tem uma sessao de trading local valida. Entre novamente antes de modificar a posicao.',
    'Invalid Stop Levels': 'Niveis stop invalidos',
    'SL/TP Not Applied': 'SL/TP nao aplicado',
    'The backend accepted the modify request but did not confirm the requested Stop Loss or Take Profit values. Please refresh positions and try again.':
      'O backend aceitou a solicitacao de modificacao mas nao confirmou os valores de Stop Loss ou Take Profit solicitados. Atualize as posicoes e tente novamente.',
    'Search symbols...': 'Buscar simbolos...',
    'Review and confirm closing order': 'Revise e confirme a ordem de fechamento',
    'Open Price': 'Preco de abertura',
    'Current Price': 'Preco atual',
    'Real-time P/L': 'P/L em tempo real',
    'Order Ticket': 'Ticket da ordem',
    'Close order submitted. Position closed successfully.': 'Ordem de fechamento enviada. Posicao fechada com sucesso.',
    'Position Error': 'Erro de posicao',
    'The position ticket is still loading. Return to Trade and select the position again.':
      'O ticket da posicao ainda esta carregando. Volte para Negociar e selecione a posicao novamente.',
    'The app does not have a valid local trading session. Log in again before closing a position.':
      'O app nao tem uma sessao de trading local valida. Entre novamente antes de fechar uma posicao.',
    'Select a matching position to pair-close.': 'Selecione uma posicao oposta para o fechamento cruzado.',
    'Source Position': 'Posicao de origem',
    'No matching positions available for close-by.': 'Nenhuma posicao compativel para o fechamento cruzado.',
    'Close-by request completed successfully.': 'Solicitacao de fechamento cruzado concluida com sucesso.',
    'Send Close By Request': 'Enviar solicitacao de Fechar por',
    'The app does not have a valid local trading session. Log in again before using Close By.':
      'O app nao tem uma sessao de trading local valida. Entre novamente antes de usar Fechar por.',
    'Close Sell Positions': 'Fechar posicoes de venda',
    'Bulk Operation': 'Operacao em lote',
    'Close {symbol} Positions': 'Fechar posicoes {symbol}',
    'Affected Positions': 'Posicoes afetadas',
    'Total Exposure P/L': 'P/L de exposicao total',
    'Active Exposures': 'Exposicoes ativas',
    'Net Exposure (USD)': 'Exposicao liquida (USD)',
    'No positions match this operation.': 'Nenhuma posicao corresponde a esta operacao.',
    'Bulk operation simulated and queued for backend execution.': 'Operacao em lote simulada e enfileirada para execucao no backend.',
    'Execute Bulk Operation': 'Executar operacao em lote',
    'You are about to activate One Click Trading mode. By clicking Accept the terms below, you acknowledge and agree to bound order submission behavior.':
      'Voce esta prestes a ativar o modo Negociacao com um clique. Ao aceitar os termos abaixo, voce reconhece e concorda com o comportamento vinculante de envio de ordens.',
    'There will be no subsequent confirmation prompt for one-click order actions once activated.':
      'Nao havera nenhuma confirmacao posterior para acoes de ordens com um clique apos a ativacao.',
    'You agree to accept all risks associated with one-click trading mode, including errors or omissions in submitting orders.':
      'Voce concorda em aceitar todos os riscos associados ao modo de negociacao com um clique, incluindo erros ou omissoes no envio de ordens.',
    'I Accept these Terms and Conditions': 'Aceito estes Termos e Condicoes',
    Accept: 'Aceitar',
  },
  fr: {
    'Go back': 'Retour',
    'Loading position...': 'Chargement de la position...',
    at: 'a',
    'Loading symbols...': 'Chargement des symboles...',
    'No symbols available': 'Aucun symbole disponible',
    Viewing: 'Affichage',
    'No open position': 'Aucune position ouverte',
    Selected: 'Selectionne',
    'live view. No open position on this symbol.': 'vue en direct. Aucune position ouverte sur ce symbole.',
    'Not set': 'Non defini',
    Distance: 'Distance',
    'Est. Loss': 'Perte est.',
    'Est. Profit': 'Profit est.',
    pts: 'pts',
    'SL/TP must be at least {points} points away from the market price. Orders are executed by the broker.':
      'Le SL/TP doit etre a au moins {points} points du prix du marche. Les ordres sont executes par le courtier.',
    'No connection': 'Pas de connexion',
    'Stop Loss must be at least {points} points below the current Bid ({price}) for a buy position.':
      'Le Stop Loss doit etre au moins {points} points sous le Bid actuel ({price}) pour une position acheteuse.',
    'Stop Loss must be at least {points} points above the current Ask ({price}) for a sell position.':
      'Le Stop Loss doit etre au moins {points} points au-dessus du Ask actuel ({price}) pour une position vendeuse.',
    'Take Profit must be at least {points} points above the current Bid ({price}) for a buy position.':
      'Le Take Profit doit etre au moins {points} points au-dessus du Bid actuel ({price}) pour une position acheteuse.',
    'Take Profit must be at least {points} points below the current Ask ({price}) for a sell position.':
      'Le Take Profit doit etre au moins {points} points sous le Ask actuel ({price}) pour une position vendeuse.',
    'Authentication Error': 'Erreur d\'authentification',
    'The app does not have a valid local trading session. Log in again before modifying the position.':
      'L\'application n\'a pas de session de trading locale valide. Reconnectez-vous avant de modifier la position.',
    'Invalid Stop Levels': 'Niveaux stop invalides',
    'SL/TP Not Applied': 'SL/TP non applique',
    'The backend accepted the modify request but did not confirm the requested Stop Loss or Take Profit values. Please refresh positions and try again.':
      'Le backend a accepte la demande de modification mais n\'a pas confirme les valeurs de Stop Loss ou Take Profit demandees. Actualisez les positions et reessayez.',
    'Search symbols...': 'Rechercher des symboles...',
    'Review and confirm closing order': 'Verifiez et confirmez l\'ordre de cloture',
    'Open Price': 'Prix d\'ouverture',
    'Current Price': 'Prix actuel',
    'Real-time P/L': 'P/L en temps reel',
    'Order Ticket': 'Ticket de l\'ordre',
    'Close order submitted. Position closed successfully.': 'Ordre de cloture envoye. Position fermee avec succes.',
    'Position Error': 'Erreur de position',
    'The position ticket is still loading. Return to Trade and select the position again.':
      'Le ticket de la position est encore en cours de chargement. Revenez a Trader et selectionnez a nouveau la position.',
    'The app does not have a valid local trading session. Log in again before closing a position.':
      'L\'application n\'a pas de session de trading locale valide. Reconnectez-vous avant de fermer une position.',
    'Select a matching position to pair-close.': 'Selectionnez une position opposee pour la cloture croisee.',
    'Source Position': 'Position source',
    'No matching positions available for close-by.': 'Aucune position compatible pour la cloture croisee.',
    'Close-by request completed successfully.': 'Demande de cloture croisee terminee avec succes.',
    'Send Close By Request': 'Envoyer la demande Fermer par',
    'The app does not have a valid local trading session. Log in again before using Close By.':
      'L\'application n\'a pas de session de trading locale valide. Reconnectez-vous avant d\'utiliser Fermer par.',
    'Close Sell Positions': 'Fermer les positions vente',
    'Bulk Operation': 'Operation groupee',
    'Close {symbol} Positions': 'Fermer les positions {symbol}',
    'Affected Positions': 'Positions concernees',
    'Total Exposure P/L': 'P/L d\'exposition totale',
    'Active Exposures': 'Expositions actives',
    'Net Exposure (USD)': 'Exposition nette (USD)',
    'No positions match this operation.': 'Aucune position ne correspond a cette operation.',
    'Bulk operation simulated and queued for backend execution.': 'Operation groupee simulee et mise en file pour execution backend.',
    'Execute Bulk Operation': 'Executer l\'operation groupee',
    'You are about to activate One Click Trading mode. By clicking Accept the terms below, you acknowledge and agree to bound order submission behavior.':
      'Vous etes sur le point d\'activer le mode Trading en un clic. En acceptant les conditions ci-dessous, vous reconnaissez et acceptez le comportement d\'envoi d\'ordres contraignant.',
    'There will be no subsequent confirmation prompt for one-click order actions once activated.':
      'Aucune confirmation ulterieure ne sera demandee pour les actions d\'ordres en un clic une fois le mode active.',
    'You agree to accept all risks associated with one-click trading mode, including errors or omissions in submitting orders.':
      'Vous acceptez tous les risques lies au mode de trading en un clic, y compris les erreurs ou omissions lors de l\'envoi des ordres.',
    'I Accept these Terms and Conditions': 'J\'accepte ces conditions generales',
    Accept: 'Accepter',
  },
  de: {
    'Go back': 'Zuruck',
    'Loading position...': 'Position wird geladen...',
    at: 'zu',
    'Loading symbols...': 'Symbole werden geladen...',
    'No symbols available': 'Keine Symbole verfugbar',
    Viewing: 'Ansicht',
    'No open position': 'Keine offene Position',
    Selected: 'Ausgewahlt',
    'live view. No open position on this symbol.': 'Live-Ansicht. Keine offene Position auf diesem Symbol.',
    'Not set': 'Nicht gesetzt',
    Distance: 'Distanz',
    'Est. Loss': 'Gesch. Verlust',
    'Est. Profit': 'Gesch. Gewinn',
    pts: 'Pkt.',
    'SL/TP must be at least {points} points away from the market price. Orders are executed by the broker.':
      'SL/TP muss mindestens {points} Punkte vom Marktpreis entfernt sein. Orders werden vom Broker ausgefuhrt.',
    'No connection': 'Keine Verbindung',
    'Stop Loss must be at least {points} points below the current Bid ({price}) for a buy position.':
      'Der Stop Loss muss bei einer Kaufposition mindestens {points} Punkte unter dem aktuellen Bid ({price}) liegen.',
    'Stop Loss must be at least {points} points above the current Ask ({price}) for a sell position.':
      'Der Stop Loss muss bei einer Verkaufsposition mindestens {points} Punkte uber dem aktuellen Ask ({price}) liegen.',
    'Take Profit must be at least {points} points above the current Bid ({price}) for a buy position.':
      'Der Take Profit muss bei einer Kaufposition mindestens {points} Punkte uber dem aktuellen Bid ({price}) liegen.',
    'Take Profit must be at least {points} points below the current Ask ({price}) for a sell position.':
      'Der Take Profit muss bei einer Verkaufsposition mindestens {points} Punkte unter dem aktuellen Ask ({price}) liegen.',
    'Authentication Error': 'Authentifizierungsfehler',
    'The app does not have a valid local trading session. Log in again before modifying the position.':
      'Die App hat keine gultige lokale Trading-Sitzung. Melden Sie sich erneut an, bevor Sie die Position andern.',
    'Invalid Stop Levels': 'Ungultige Stop-Level',
    'SL/TP Not Applied': 'SL/TP nicht ubernommen',
    'The backend accepted the modify request but did not confirm the requested Stop Loss or Take Profit values. Please refresh positions and try again.':
      'Das Backend hat die Anderungsanfrage akzeptiert, aber die angeforderten Stop-Loss- oder Take-Profit-Werte nicht bestatigt. Aktualisieren Sie die Positionen und versuchen Sie es erneut.',
    'Search symbols...': 'Symbole suchen...',
    'Review and confirm closing order': 'Schliessungsorder prufen und bestatigen',
    'Open Price': 'Eroffnungspreis',
    'Current Price': 'Aktueller Preis',
    'Real-time P/L': 'Echtzeit-G/V',
    'Order Ticket': 'Order-Ticket',
    'Close order submitted. Position closed successfully.': 'Schliessungsorder gesendet. Position erfolgreich geschlossen.',
    'Position Error': 'Positionsfehler',
    'The position ticket is still loading. Return to Trade and select the position again.':
      'Das Positionsticket wird noch geladen. Kehren Sie zu Handeln zuruck und wahlen Sie die Position erneut.',
    'The app does not have a valid local trading session. Log in again before closing a position.':
      'Die App hat keine gultige lokale Trading-Sitzung. Melden Sie sich erneut an, bevor Sie eine Position schliessen.',
    'Select a matching position to pair-close.': 'Wahlen Sie eine passende Gegenposition zum Schliessen.',
    'Source Position': 'Ausgangsposition',
    'No matching positions available for close-by.': 'Keine passenden Positionen zum Gegenschliessen verfugbar.',
    'Close-by request completed successfully.': 'Gegenschliessung erfolgreich abgeschlossen.',
    'Send Close By Request': 'Anfrage zum Gegenschliessen senden',
    'The app does not have a valid local trading session. Log in again before using Close By.':
      'Die App hat keine gultige lokale Trading-Sitzung. Melden Sie sich erneut an, bevor Sie Schliessen durch verwenden.',
    'Close Sell Positions': 'Verkaufspositionen schliessen',
    'Bulk Operation': 'Sammelaktion',
    'Close {symbol} Positions': '{symbol}-Positionen schliessen',
    'Affected Positions': 'Betroffene Positionen',
    'Total Exposure P/L': 'Gesamtexposure-G/V',
    'Active Exposures': 'Aktive Exposures',
    'Net Exposure (USD)': 'Netto-Exposure (USD)',
    'No positions match this operation.': 'Keine Positionen passen zu dieser Aktion.',
    'Bulk operation simulated and queued for backend execution.': 'Sammelaktion simuliert und fur die Backend-Ausfuhrung eingereiht.',
    'Execute Bulk Operation': 'Sammelaktion ausfuhren',
    'You are about to activate One Click Trading mode. By clicking Accept the terms below, you acknowledge and agree to bound order submission behavior.':
      'Sie sind dabei, den Ein-Klick-Handel zu aktivieren. Mit Annahme der folgenden Bedingungen erkennen Sie das verbindliche Orderubermittlungsverhalten an und stimmen ihm zu.',
    'There will be no subsequent confirmation prompt for one-click order actions once activated.':
      'Nach der Aktivierung erfolgt keine weitere Bestatigungsabfrage fur Ein-Klick-Orderaktionen.',
    'You agree to accept all risks associated with one-click trading mode, including errors or omissions in submitting orders.':
      'Sie akzeptieren alle Risiken des Ein-Klick-Handelsmodus, einschliesslich Fehlern oder Auslassungen bei der Orderubermittlung.',
    'I Accept these Terms and Conditions': 'Ich akzeptiere diese Geschaftsbedingungen',
    Accept: 'Akzeptieren',
  },
  it: {
    'Go back': 'Indietro',
    'Loading position...': 'Caricamento posizione...',
    at: 'a',
    'Loading symbols...': 'Caricamento simboli...',
    'No symbols available': 'Nessun simbolo disponibile',
    Viewing: 'In visualizzazione',
    'No open position': 'Nessuna posizione aperta',
    Selected: 'Selezionata',
    'live view. No open position on this symbol.': 'vista live. Nessuna posizione aperta su questo simbolo.',
    'Not set': 'Non impostato',
    Distance: 'Distanza',
    'Est. Loss': 'Perdita stimata',
    'Est. Profit': 'Profitto stimato',
    pts: 'pts',
    'SL/TP must be at least {points} points away from the market price. Orders are executed by the broker.':
      'SL/TP deve distare almeno {points} punti dal prezzo di mercato. Gli ordini sono eseguiti dal broker.',
    'No connection': 'Nessuna connessione',
    'Stop Loss must be at least {points} points below the current Bid ({price}) for a buy position.':
      'Lo Stop Loss deve essere almeno {points} punti sotto il Bid attuale ({price}) per una posizione di acquisto.',
    'Stop Loss must be at least {points} points above the current Ask ({price}) for a sell position.':
      'Lo Stop Loss deve essere almeno {points} punti sopra l\'Ask attuale ({price}) per una posizione di vendita.',
    'Take Profit must be at least {points} points above the current Bid ({price}) for a buy position.':
      'Il Take Profit deve essere almeno {points} punti sopra il Bid attuale ({price}) per una posizione di acquisto.',
    'Take Profit must be at least {points} points below the current Ask ({price}) for a sell position.':
      'Il Take Profit deve essere almeno {points} punti sotto l\'Ask attuale ({price}) per una posizione di vendita.',
    'Authentication Error': 'Errore di autenticazione',
    'The app does not have a valid local trading session. Log in again before modifying the position.':
      'L\'app non ha una sessione di trading locale valida. Accedi di nuovo prima di modificare la posizione.',
    'Invalid Stop Levels': 'Livelli stop non validi',
    'SL/TP Not Applied': 'SL/TP non applicato',
    'The backend accepted the modify request but did not confirm the requested Stop Loss or Take Profit values. Please refresh positions and try again.':
      'Il backend ha accettato la richiesta di modifica ma non ha confermato i valori di Stop Loss o Take Profit richiesti. Aggiorna le posizioni e riprova.',
    'Search symbols...': 'Cerca simboli...',
    'Review and confirm closing order': 'Rivedi e conferma l\'ordine di chiusura',
    'Open Price': 'Prezzo di apertura',
    'Current Price': 'Prezzo attuale',
    'Real-time P/L': 'P/L in tempo reale',
    'Order Ticket': 'Ticket dell\'ordine',
    'Close order submitted. Position closed successfully.': 'Ordine di chiusura inviato. Posizione chiusa con successo.',
    'Position Error': 'Errore posizione',
    'The position ticket is still loading. Return to Trade and select the position again.':
      'Il ticket della posizione e ancora in caricamento. Torna alla sezione Trade e seleziona di nuovo la posizione.',
    'The app does not have a valid local trading session. Log in again before closing a position.':
      'L\'app non ha una sessione di trading locale valida. Accedi di nuovo prima di chiudere una posizione.',
    'Select a matching position to pair-close.': 'Seleziona una posizione opposta per la chiusura incrociata.',
    'Source Position': 'Posizione di origine',
    'No matching positions available for close-by.': 'Nessuna posizione compatibile per la chiusura incrociata.',
    'Close-by request completed successfully.': 'Richiesta di chiusura incrociata completata con successo.',
    'Send Close By Request': 'Invia richiesta Chiudi per',
    'The app does not have a valid local trading session. Log in again before using Close By.':
      'L\'app non ha una sessione di trading locale valida. Accedi di nuovo prima di usare Chiudi per.',
    'Close Sell Positions': 'Chiudi posizioni sell',
    'Bulk Operation': 'Operazione massiva',
    'Close {symbol} Positions': 'Chiudi posizioni {symbol}',
    'Affected Positions': 'Posizioni interessate',
    'Total Exposure P/L': 'P/L esposizione totale',
    'Active Exposures': 'Esposizioni attive',
    'Net Exposure (USD)': 'Esposizione netta (USD)',
    'No positions match this operation.': 'Nessuna posizione corrisponde a questa operazione.',
    'Bulk operation simulated and queued for backend execution.': 'Operazione massiva simulata e in coda per l\'esecuzione backend.',
    'Execute Bulk Operation': 'Esegui operazione massiva',
    'You are about to activate One Click Trading mode. By clicking Accept the terms below, you acknowledge and agree to bound order submission behavior.':
      'Stai per attivare la modalita Trading con un clic. Accettando i termini seguenti riconosci e accetti il comportamento vincolante di invio degli ordini.',
    'There will be no subsequent confirmation prompt for one-click order actions once activated.':
      'Dopo l\'attivazione non ci sara alcuna conferma successiva per le azioni degli ordini con un clic.',
    'You agree to accept all risks associated with one-click trading mode, including errors or omissions in submitting orders.':
      'Accetti tutti i rischi associati alla modalita di trading con un clic, inclusi errori od omissioni nell\'invio degli ordini.',
    'I Accept these Terms and Conditions': 'Accetto questi Termini e Condizioni',
    Accept: 'Accetta',
  },
  ru: {
    'Go back': 'Назад',
    'Loading position...': 'Загрузка позиции...',
    at: 'по',
    'Loading symbols...': 'Загрузка символов...',
    'No symbols available': 'Нет доступных символов',
    Viewing: 'Просмотр',
    'No open position': 'Нет открытой позиции',
    Selected: 'Выбрано',
    'live view. No open position on this symbol.': 'режим просмотра. Нет открытой позиции по этому символу.',
    'Not set': 'Не задано',
    Distance: 'Дистанция',
    'Est. Loss': 'Оцен. убыток',
    'Est. Profit': 'Оцен. прибыль',
    pts: 'пт',
    'SL/TP must be at least {points} points away from the market price. Orders are executed by the broker.':
      'SL/TP должен отстоять от рыночной цены минимум на {points} пунктов. Ордера исполняет брокер.',
    'No connection': 'Нет соединения',
    'Stop Loss must be at least {points} points below the current Bid ({price}) for a buy position.':
      'Стоп-лосс должен быть минимум на {points} пунктов ниже текущего Bid ({price}) для позиции на покупку.',
    'Stop Loss must be at least {points} points above the current Ask ({price}) for a sell position.':
      'Стоп-лосс должен быть минимум на {points} пунктов выше текущего Ask ({price}) для позиции на продажу.',
    'Take Profit must be at least {points} points above the current Bid ({price}) for a buy position.':
      'Тейк-профит должен быть минимум на {points} пунктов выше текущего Bid ({price}) для позиции на покупку.',
    'Take Profit must be at least {points} points below the current Ask ({price}) for a sell position.':
      'Тейк-профит должен быть минимум на {points} пунктов ниже текущего Ask ({price}) для позиции на продажу.',
    'Authentication Error': 'Ошибка аутентификации',
    'The app does not have a valid local trading session. Log in again before modifying the position.':
      'В приложении нет действительной локальной торговой сессии. Войдите снова, прежде чем изменять позицию.',
    'Invalid Stop Levels': 'Недопустимые стоп-уровни',
    'SL/TP Not Applied': 'SL/TP не применены',
    'The backend accepted the modify request but did not confirm the requested Stop Loss or Take Profit values. Please refresh positions and try again.':
      'Бэкенд принял запрос на изменение, но не подтвердил запрошенные значения стоп-лосса или тейк-профита. Обновите позиции и попробуйте снова.',
    'Search symbols...': 'Поиск символов...',
    'Review and confirm closing order': 'Проверьте и подтвердите ордер на закрытие',
    'Open Price': 'Цена открытия',
    'Current Price': 'Текущая цена',
    'Real-time P/L': 'P/L в реальном времени',
    'Order Ticket': 'Тикет ордера',
    'Close order submitted. Position closed successfully.': 'Ордер на закрытие отправлен. Позиция успешно закрыта.',
    'Position Error': 'Ошибка позиции',
    'The position ticket is still loading. Return to Trade and select the position again.':
      'Тикет позиции ещё загружается. Вернитесь в раздел «Торговля» и выберите позицию снова.',
    'The app does not have a valid local trading session. Log in again before closing a position.':
      'В приложении нет действительной локальной торговой сессии. Войдите снова, прежде чем закрывать позицию.',
    'Select a matching position to pair-close.': 'Выберите встречную позицию для взаимного закрытия.',
    'Source Position': 'Исходная позиция',
    'No matching positions available for close-by.': 'Нет подходящих позиций для встречного закрытия.',
    'Close-by request completed successfully.': 'Запрос на встречное закрытие успешно выполнен.',
    'Send Close By Request': 'Отправить запрос на встречное закрытие',
    'The app does not have a valid local trading session. Log in again before using Close By.':
      'В приложении нет действительной локальной торговой сессии. Войдите снова, прежде чем использовать встречное закрытие.',
    'Close Sell Positions': 'Закрыть позиции Sell',
    'Bulk Operation': 'Массовая операция',
    'Close {symbol} Positions': 'Закрыть позиции {symbol}',
    'Affected Positions': 'Затронутые позиции',
    'Total Exposure P/L': 'P/L общей экспозиции',
    'Active Exposures': 'Активные экспозиции',
    'Net Exposure (USD)': 'Чистая экспозиция (USD)',
    'No positions match this operation.': 'Ни одна позиция не подходит под эту операцию.',
    'Bulk operation simulated and queued for backend execution.': 'Массовая операция смоделирована и поставлена в очередь на исполнение на сервере.',
    'Execute Bulk Operation': 'Выполнить массовую операцию',
    'You are about to activate One Click Trading mode. By clicking Accept the terms below, you acknowledge and agree to bound order submission behavior.':
      'Вы собираетесь включить режим торговли в один клик. Принимая условия ниже, вы подтверждаете и принимаете обязательный порядок отправки ордеров.',
    'There will be no subsequent confirmation prompt for one-click order actions once activated.':
      'После активации подтверждение действий с ордерами в один клик запрашиваться не будет.',
    'You agree to accept all risks associated with one-click trading mode, including errors or omissions in submitting orders.':
      'Вы принимаете все риски, связанные с режимом торговли в один клик, включая ошибки или упущения при отправке ордеров.',
    'I Accept these Terms and Conditions': 'Я принимаю эти условия',
    Accept: 'Принять',
  },
  tr: {
    'Go back': 'Geri',
    'Loading position...': 'Pozisyon yukleniyor...',
    at: '@',
    'Loading symbols...': 'Semboller yukleniyor...',
    'No symbols available': 'Kullanilabilir sembol yok',
    Viewing: 'Goruntuleniyor',
    'No open position': 'Acik pozisyon yok',
    Selected: 'Secili',
    'live view. No open position on this symbol.': 'canli gorunum. Bu sembolde acik pozisyon yok.',
    'Not set': 'Ayarlanmadi',
    Distance: 'Mesafe',
    'Est. Loss': 'Tahmini zarar',
    'Est. Profit': 'Tahmini kar',
    pts: 'puan',
    'SL/TP must be at least {points} points away from the market price. Orders are executed by the broker.':
      'SL/TP piyasa fiyatindan en az {points} puan uzakta olmalidir. Emirler broker tarafindan gerceklestirilir.',
    'No connection': 'Baglanti yok',
    'Stop Loss must be at least {points} points below the current Bid ({price}) for a buy position.':
      'Alis pozisyonunda Zarar Durdur, guncel Bid ({price}) seviyesinin en az {points} puan altinda olmalidir.',
    'Stop Loss must be at least {points} points above the current Ask ({price}) for a sell position.':
      'Satis pozisyonunda Zarar Durdur, guncel Ask ({price}) seviyesinin en az {points} puan ustunde olmalidir.',
    'Take Profit must be at least {points} points above the current Bid ({price}) for a buy position.':
      'Alis pozisyonunda Kar Al, guncel Bid ({price}) seviyesinin en az {points} puan ustunde olmalidir.',
    'Take Profit must be at least {points} points below the current Ask ({price}) for a sell position.':
      'Satis pozisyonunda Kar Al, guncel Ask ({price}) seviyesinin en az {points} puan altinda olmalidir.',
    'Authentication Error': 'Kimlik dogrulama hatasi',
    'The app does not have a valid local trading session. Log in again before modifying the position.':
      'Uygulamada gecerli bir yerel islem oturumu yok. Pozisyonu degistirmeden once yeniden giris yapin.',
    'Invalid Stop Levels': 'Gecersiz stop seviyeleri',
    'SL/TP Not Applied': 'SL/TP uygulanmadi',
    'The backend accepted the modify request but did not confirm the requested Stop Loss or Take Profit values. Please refresh positions and try again.':
      'Sunucu degisiklik istegini kabul etti ancak istenen Zarar Durdur veya Kar Al degerlerini onaylamadi. Pozisyonlari yenileyip tekrar deneyin.',
    'Search symbols...': 'Sembol ara...',
    'Review and confirm closing order': 'Kapatma emrini inceleyin ve onaylayin',
    'Open Price': 'Acilis fiyati',
    'Current Price': 'Guncel fiyat',
    'Real-time P/L': 'Gercek zamanli K/Z',
    'Order Ticket': 'Emir bileti',
    'Close order submitted. Position closed successfully.': 'Kapatma emri gonderildi. Pozisyon basariyla kapatildi.',
    'Position Error': 'Pozisyon hatasi',
    'The position ticket is still loading. Return to Trade and select the position again.':
      'Pozisyon bileti hala yukleniyor. Islem sekmesine donup pozisyonu yeniden secin.',
    'The app does not have a valid local trading session. Log in again before closing a position.':
      'Uygulamada gecerli bir yerel islem oturumu yok. Pozisyon kapatmadan once yeniden giris yapin.',
    'Select a matching position to pair-close.': 'Karsilikli kapatma icin eslesen bir pozisyon secin.',
    'Source Position': 'Kaynak pozisyon',
    'No matching positions available for close-by.': 'Karsilikli kapatma icin uygun pozisyon yok.',
    'Close-by request completed successfully.': 'Karsilikli kapatma istegi basariyla tamamlandi.',
    'Send Close By Request': 'Karsilikli kapatma istegi gonder',
    'The app does not have a valid local trading session. Log in again before using Close By.':
      'Uygulamada gecerli bir yerel islem oturumu yok. Karsilikli kapatmayi kullanmadan once yeniden giris yapin.',
    'Close Sell Positions': 'Satis pozisyonlarini kapat',
    'Bulk Operation': 'Toplu islem',
    'Close {symbol} Positions': '{symbol} pozisyonlarini kapat',
    'Affected Positions': 'Etkilenen pozisyonlar',
    'Total Exposure P/L': 'Toplam maruziyet K/Z',
    'Active Exposures': 'Aktif maruziyetler',
    'Net Exposure (USD)': 'Net maruziyet (USD)',
    'No positions match this operation.': 'Bu isleme uyan pozisyon yok.',
    'Bulk operation simulated and queued for backend execution.': 'Toplu islem simule edildi ve sunucuda yurutulmek uzere siraya alindi.',
    'Execute Bulk Operation': 'Toplu islemi calistir',
    'You are about to activate One Click Trading mode. By clicking Accept the terms below, you acknowledge and agree to bound order submission behavior.':
      'Tek tikla islem modunu etkinlestirmek uzeresiniz. Asagidaki kosullari kabul ederek baglayici emir gonderme davranisini kabul etmis olursunuz.',
    'There will be no subsequent confirmation prompt for one-click order actions once activated.':
      'Etkinlestirildikten sonra tek tik emir islemleri icin ek bir onay istenmez.',
    'You agree to accept all risks associated with one-click trading mode, including errors or omissions in submitting orders.':
      'Tek tikla islem moduna iliskin tum riskleri, emir gonderiminde hata veya eksiklikler dahil, kabul edersiniz.',
    'I Accept these Terms and Conditions': 'Bu sart ve kosullari kabul ediyorum',
    Accept: 'Kabul et',
  },
  ar: {
    'Go back': 'رجوع',
    'Loading position...': 'جارٍ تحميل المركز...',
    at: 'عند',
    'Loading symbols...': 'جارٍ تحميل الرموز...',
    'No symbols available': 'لا توجد رموز متاحة',
    Viewing: 'قيد العرض',
    'No open position': 'لا يوجد مركز مفتوح',
    Selected: 'محدد',
    'live view. No open position on this symbol.': 'عرض مباشر. لا يوجد مركز مفتوح على هذا الرمز.',
    'Not set': 'غير محدد',
    Distance: 'المسافة',
    'Est. Loss': 'الخسارة المقدرة',
    'Est. Profit': 'الربح المقدر',
    pts: 'نقطة',
    'SL/TP must be at least {points} points away from the market price. Orders are executed by the broker.':
      'يجب أن يبعد SL/TP عن سعر السوق بما لا يقل عن {points} نقاط. يقوم الوسيط بتنفيذ الأوامر.',
    'No connection': 'لا يوجد اتصال',
    'Stop Loss must be at least {points} points below the current Bid ({price}) for a buy position.':
      'يجب أن يكون وقف الخسارة أدنى من Bid الحالي ({price}) بما لا يقل عن {points} نقاط لمركز شراء.',
    'Stop Loss must be at least {points} points above the current Ask ({price}) for a sell position.':
      'يجب أن يكون وقف الخسارة أعلى من Ask الحالي ({price}) بما لا يقل عن {points} نقاط لمركز بيع.',
    'Take Profit must be at least {points} points above the current Bid ({price}) for a buy position.':
      'يجب أن يكون جني الربح أعلى من Bid الحالي ({price}) بما لا يقل عن {points} نقاط لمركز شراء.',
    'Take Profit must be at least {points} points below the current Ask ({price}) for a sell position.':
      'يجب أن يكون جني الربح أدنى من Ask الحالي ({price}) بما لا يقل عن {points} نقاط لمركز بيع.',
    'Authentication Error': 'خطأ في المصادقة',
    'The app does not have a valid local trading session. Log in again before modifying the position.':
      'لا يملك التطبيق جلسة تداول محلية صالحة. سجل الدخول مجددًا قبل تعديل المركز.',
    'Invalid Stop Levels': 'مستويات إيقاف غير صالحة',
    'SL/TP Not Applied': 'لم يتم تطبيق SL/TP',
    'The backend accepted the modify request but did not confirm the requested Stop Loss or Take Profit values. Please refresh positions and try again.':
      'قبل الخادم طلب التعديل لكنه لم يؤكد قيم وقف الخسارة أو جني الربح المطلوبة. حدّث المراكز وحاول مجددًا.',
    'Search symbols...': 'البحث عن الرموز...',
    'Review and confirm closing order': 'راجع أمر الإغلاق وقم بتأكيده',
    'Open Price': 'سعر الافتتاح',
    'Current Price': 'السعر الحالي',
    'Real-time P/L': 'الربح/الخسارة الفورية',
    'Order Ticket': 'تذكرة الأمر',
    'Close order submitted. Position closed successfully.': 'تم إرسال أمر الإغلاق. تم إغلاق المركز بنجاح.',
    'Position Error': 'خطأ في المركز',
    'The position ticket is still loading. Return to Trade and select the position again.':
      'لا تزال تذكرة المركز قيد التحميل. عد إلى التداول واختر المركز مجددًا.',
    'The app does not have a valid local trading session. Log in again before closing a position.':
      'لا يملك التطبيق جلسة تداول محلية صالحة. سجل الدخول مجددًا قبل إغلاق مركز.',
    'Select a matching position to pair-close.': 'اختر مركزًا مقابلًا للإغلاق المتبادل.',
    'Source Position': 'المركز الأصلي',
    'No matching positions available for close-by.': 'لا توجد مراكز مطابقة للإغلاق المتبادل.',
    'Close-by request completed successfully.': 'اكتمل طلب الإغلاق المتبادل بنجاح.',
    'Send Close By Request': 'إرسال طلب الإغلاق المتبادل',
    'The app does not have a valid local trading session. Log in again before using Close By.':
      'لا يملك التطبيق جلسة تداول محلية صالحة. سجل الدخول مجددًا قبل استخدام الإغلاق المتبادل.',
    'Close Sell Positions': 'إغلاق مراكز البيع',
    'Bulk Operation': 'عملية جماعية',
    'Close {symbol} Positions': 'إغلاق مراكز {symbol}',
    'Affected Positions': 'المراكز المتأثرة',
    'Total Exposure P/L': 'ربح/خسارة إجمالي التعرض',
    'Active Exposures': 'التعرضات النشطة',
    'Net Exposure (USD)': 'صافي التعرض (USD)',
    'No positions match this operation.': 'لا توجد مراكز مطابقة لهذه العملية.',
    'Bulk operation simulated and queued for backend execution.': 'تمت محاكاة العملية الجماعية ووضعها في قائمة الانتظار للتنفيذ على الخادم.',
    'Execute Bulk Operation': 'تنفيذ العملية الجماعية',
    'You are about to activate One Click Trading mode. By clicking Accept the terms below, you acknowledge and agree to bound order submission behavior.':
      'أنت على وشك تفعيل وضع التداول بنقرة واحدة. بقبول الشروط أدناه فإنك تقر وتوافق على سلوك إرسال الأوامر الملزم.',
    'There will be no subsequent confirmation prompt for one-click order actions once activated.':
      'لن يظهر أي تأكيد لاحق لإجراءات الأوامر بنقرة واحدة بعد التفعيل.',
    'You agree to accept all risks associated with one-click trading mode, including errors or omissions in submitting orders.':
      'أنت توافق على تحمل جميع المخاطر المرتبطة بوضع التداول بنقرة واحدة، بما في ذلك الأخطاء أو الإغفالات عند إرسال الأوامر.',
    'I Accept these Terms and Conditions': 'أوافق على هذه الشروط والأحكام',
    Accept: 'موافق',
  },
  hi: {
    'Go back': 'वापस जाएं',
    'Loading position...': 'पोजीशन लोड हो रही है...',
    at: '@',
    'Loading symbols...': 'सिंबल लोड हो रहे हैं...',
    'No symbols available': 'कोई सिंबल उपलब्ध नहीं',
    Viewing: 'देख रहे हैं',
    'No open position': 'कोई खुली पोजीशन नहीं',
    Selected: 'चयनित',
    'live view. No open position on this symbol.': 'लाइव व्यू। इस सिंबल पर कोई खुली पोजीशन नहीं।',
    'Not set': 'सेट नहीं',
    Distance: 'दूरी',
    'Est. Loss': 'अनु. हानि',
    'Est. Profit': 'अनु. लाभ',
    pts: 'पॉइंट',
    'SL/TP must be at least {points} points away from the market price. Orders are executed by the broker.':
      'SL/TP बाज़ार मूल्य से कम से कम {points} पॉइंट दूर होना चाहिए। ऑर्डर ब्रोकर द्वारा निष्पादित किए जाते हैं।',
    'No connection': 'कोई कनेक्शन नहीं',
    'Stop Loss must be at least {points} points below the current Bid ({price}) for a buy position.':
      'Buy पोजीशन के लिए स्टॉप लॉस मौजूदा Bid ({price}) से कम से कम {points} पॉइंट नीचे होना चाहिए।',
    'Stop Loss must be at least {points} points above the current Ask ({price}) for a sell position.':
      'Sell पोजीशन के लिए स्टॉप लॉस मौजूदा Ask ({price}) से कम से कम {points} पॉइंट ऊपर होना चाहिए।',
    'Take Profit must be at least {points} points above the current Bid ({price}) for a buy position.':
      'Buy पोजीशन के लिए टेक प्रॉफिट मौजूदा Bid ({price}) से कम से कम {points} पॉइंट ऊपर होना चाहिए।',
    'Take Profit must be at least {points} points below the current Ask ({price}) for a sell position.':
      'Sell पोजीशन के लिए टेक प्रॉफिट मौजूदा Ask ({price}) से कम से कम {points} पॉइंट नीचे होना चाहिए।',
    'Authentication Error': 'प्रमाणीकरण त्रुटि',
    'The app does not have a valid local trading session. Log in again before modifying the position.':
      'ऐप के पास वैध लोकल ट्रेडिंग सेशन नहीं है। पोजीशन बदलने से पहले फिर से लॉगिन करें।',
    'Invalid Stop Levels': 'अमान्य स्टॉप स्तर',
    'SL/TP Not Applied': 'SL/TP लागू नहीं हुआ',
    'The backend accepted the modify request but did not confirm the requested Stop Loss or Take Profit values. Please refresh positions and try again.':
      'बैकएंड ने संशोधन अनुरोध स्वीकार किया लेकिन अनुरोधित स्टॉप लॉस या टेक प्रॉफिट मानों की पुष्टि नहीं की। पोजीशन रीफ्रेश करके फिर से प्रयास करें।',
    'Search symbols...': 'सिंबल खोजें...',
    'Review and confirm closing order': 'क्लोज़िंग ऑर्डर की समीक्षा करें और पुष्टि करें',
    'Open Price': 'ओपन प्राइस',
    'Current Price': 'मौजूदा प्राइस',
    'Real-time P/L': 'रीयल-टाइम P/L',
    'Order Ticket': 'ऑर्डर टिकट',
    'Close order submitted. Position closed successfully.': 'क्लोज़ ऑर्डर सबमिट हुआ। पोजीशन सफलतापूर्वक बंद हुई।',
    'Position Error': 'पोजीशन त्रुटि',
    'The position ticket is still loading. Return to Trade and select the position again.':
      'पोजीशन टिकट अभी लोड हो रहा है। ट्रेड में वापस जाकर पोजीशन फिर से चुनें।',
    'The app does not have a valid local trading session. Log in again before closing a position.':
      'ऐप के पास वैध लोकल ट्रेडिंग सेशन नहीं है। पोजीशन बंद करने से पहले फिर से लॉगिन करें।',
    'Select a matching position to pair-close.': 'पेयर-क्लोज़ के लिए मेल खाती पोजीशन चुनें।',
    'Source Position': 'स्रोत पोजीशन',
    'No matching positions available for close-by.': 'क्लोज़-बाय के लिए कोई मेल खाती पोजीशन उपलब्ध नहीं।',
    'Close-by request completed successfully.': 'क्लोज़-बाय अनुरोध सफलतापूर्वक पूरा हुआ।',
    'Send Close By Request': 'Close By अनुरोध भेजें',
    'The app does not have a valid local trading session. Log in again before using Close By.':
      'ऐप के पास वैध लोकल ट्रेडिंग सेशन नहीं है। Close By उपयोग करने से पहले फिर से लॉगिन करें।',
    'Close Sell Positions': 'Sell पोजीशन बंद करें',
    'Bulk Operation': 'बल्क ऑपरेशन',
    'Close {symbol} Positions': '{symbol} पोजीशन बंद करें',
    'Affected Positions': 'प्रभावित पोजीशन',
    'Total Exposure P/L': 'कुल एक्सपोज़र P/L',
    'Active Exposures': 'सक्रिय एक्सपोज़र',
    'Net Exposure (USD)': 'नेट एक्सपोज़र (USD)',
    'No positions match this operation.': 'इस ऑपरेशन से कोई पोजीशन मेल नहीं खाती।',
    'Bulk operation simulated and queued for backend execution.': 'बल्क ऑपरेशन सिम्युलेट हुआ और बैकएंड निष्पादन के लिए कतार में है।',
    'Execute Bulk Operation': 'बल्क ऑपरेशन निष्पादित करें',
    'You are about to activate One Click Trading mode. By clicking Accept the terms below, you acknowledge and agree to bound order submission behavior.':
      'आप वन क्लिक ट्रेडिंग मोड सक्रिय करने वाले हैं। नीचे दी गई शर्तें स्वीकार करके आप बाध्यकारी ऑर्डर सबमिशन व्यवहार को स्वीकार करते हैं।',
    'There will be no subsequent confirmation prompt for one-click order actions once activated.':
      'सक्रिय होने के बाद वन-क्लिक ऑर्डर क्रियाओं के लिए कोई अतिरिक्त पुष्टि नहीं मांगी जाएगी।',
    'You agree to accept all risks associated with one-click trading mode, including errors or omissions in submitting orders.':
      'आप वन-क्लिक ट्रेडिंग मोड से जुड़े सभी जोखिम स्वीकार करते हैं, जिनमें ऑर्डर सबमिट करने में त्रुटियां या चूक शामिल हैं।',
    'I Accept these Terms and Conditions': 'मैं इन नियम और शर्तों को स्वीकार करता/करती हूं',
    Accept: 'स्वीकार करें',
  },
  bn: {
    'Go back': 'ফিরে যান',
    'Loading position...': 'পজিশন লোড হচ্ছে...',
    at: '@',
    'Loading symbols...': 'সিম্বল লোড হচ্ছে...',
    'No symbols available': 'কোনো সিম্বল উপলব্ধ নেই',
    Viewing: 'দেখা হচ্ছে',
    'No open position': 'কোনো খোলা পজিশন নেই',
    Selected: 'নির্বাচিত',
    'live view. No open position on this symbol.': 'লাইভ ভিউ। এই সিম্বলে কোনো খোলা পজিশন নেই।',
    'Not set': 'সেট করা নেই',
    Distance: 'দূরত্ব',
    'Est. Loss': 'আনু. লোকসান',
    'Est. Profit': 'আনু. লাভ',
    pts: 'পয়েন্ট',
    'SL/TP must be at least {points} points away from the market price. Orders are executed by the broker.':
      'SL/TP বাজার মূল্য থেকে কমপক্ষে {points} পয়েন্ট দূরে থাকতে হবে। অর্ডার ব্রোকার কার্যকর করে।',
    'No connection': 'কোনো সংযোগ নেই',
    'Stop Loss must be at least {points} points below the current Bid ({price}) for a buy position.':
      'Buy পজিশনের জন্য স্টপ লস বর্তমান Bid ({price}) থেকে কমপক্ষে {points} পয়েন্ট নিচে থাকতে হবে।',
    'Stop Loss must be at least {points} points above the current Ask ({price}) for a sell position.':
      'Sell পজিশনের জন্য স্টপ লস বর্তমান Ask ({price}) থেকে কমপক্ষে {points} পয়েন্ট উপরে থাকতে হবে।',
    'Take Profit must be at least {points} points above the current Bid ({price}) for a buy position.':
      'Buy পজিশনের জন্য টেক প্রফিট বর্তমান Bid ({price}) থেকে কমপক্ষে {points} পয়েন্ট উপরে থাকতে হবে।',
    'Take Profit must be at least {points} points below the current Ask ({price}) for a sell position.':
      'Sell পজিশনের জন্য টেক প্রফিট বর্তমান Ask ({price}) থেকে কমপক্ষে {points} পয়েন্ট নিচে থাকতে হবে।',
    'Authentication Error': 'প্রমাণীকরণ ত্রুটি',
    'The app does not have a valid local trading session. Log in again before modifying the position.':
      'অ্যাপে বৈধ লোকাল ট্রেডিং সেশন নেই। পজিশন পরিবর্তনের আগে আবার লগইন করুন।',
    'Invalid Stop Levels': 'অবৈধ স্টপ লেভেল',
    'SL/TP Not Applied': 'SL/TP প্রয়োগ হয়নি',
    'The backend accepted the modify request but did not confirm the requested Stop Loss or Take Profit values. Please refresh positions and try again.':
      'ব্যাকএন্ড পরিবর্তনের অনুরোধ গ্রহণ করেছে কিন্তু অনুরোধ করা স্টপ লস বা টেক প্রফিট মান নিশ্চিত করেনি। পজিশন রিফ্রেশ করে আবার চেষ্টা করুন।',
    'Search symbols...': 'সিম্বল খুঁজুন...',
    'Review and confirm closing order': 'ক্লোজিং অর্ডার পর্যালোচনা করে নিশ্চিত করুন',
    'Open Price': 'ওপেন প্রাইস',
    'Current Price': 'বর্তমান প্রাইস',
    'Real-time P/L': 'রিয়েল-টাইম P/L',
    'Order Ticket': 'অর্ডার টিকিট',
    'Close order submitted. Position closed successfully.': 'ক্লোজ অর্ডার জমা হয়েছে। পজিশন সফলভাবে বন্ধ হয়েছে।',
    'Position Error': 'পজিশন ত্রুটি',
    'The position ticket is still loading. Return to Trade and select the position again.':
      'পজিশন টিকিট এখনও লোড হচ্ছে। ট্রেড-এ ফিরে গিয়ে পজিশনটি আবার নির্বাচন করুন।',
    'The app does not have a valid local trading session. Log in again before closing a position.':
      'অ্যাপে বৈধ লোকাল ট্রেডিং সেশন নেই। পজিশন বন্ধ করার আগে আবার লগইন করুন।',
    'Select a matching position to pair-close.': 'পেয়ার-ক্লোজের জন্য মিল থাকা একটি পজিশন নির্বাচন করুন।',
    'Source Position': 'উৎস পজিশন',
    'No matching positions available for close-by.': 'ক্লোজ-বাই করার মতো কোনো মিল থাকা পজিশন নেই।',
    'Close-by request completed successfully.': 'ক্লোজ-বাই অনুরোধ সফলভাবে সম্পন্ন হয়েছে।',
    'Send Close By Request': 'Close By অনুরোধ পাঠান',
    'The app does not have a valid local trading session. Log in again before using Close By.':
      'অ্যাপে বৈধ লোকাল ট্রেডিং সেশন নেই। Close By ব্যবহারের আগে আবার লগইন করুন।',
    'Close Sell Positions': 'Sell পজিশন বন্ধ করুন',
    'Bulk Operation': 'বাল্ক অপারেশন',
    'Close {symbol} Positions': '{symbol} পজিশন বন্ধ করুন',
    'Affected Positions': 'প্রভাবিত পজিশন',
    'Total Exposure P/L': 'মোট এক্সপোজার P/L',
    'Active Exposures': 'সক্রিয় এক্সপোজার',
    'Net Exposure (USD)': 'নেট এক্সপোজার (USD)',
    'No positions match this operation.': 'এই অপারেশনের সাথে কোনো পজিশন মেলে না।',
    'Bulk operation simulated and queued for backend execution.': 'বাল্ক অপারেশন সিমুলেট হয়েছে এবং ব্যাকএন্ড কার্যকরের জন্য সারিতে আছে।',
    'Execute Bulk Operation': 'বাল্ক অপারেশন কার্যকর করুন',
    'You are about to activate One Click Trading mode. By clicking Accept the terms below, you acknowledge and agree to bound order submission behavior.':
      'আপনি ওয়ান ক্লিক ট্রেডিং মোড চালু করতে যাচ্ছেন। নিচের শর্তাবলি গ্রহণ করে আপনি বাধ্যতামূলক অর্ডার জমা আচরণ স্বীকার ও সম্মত হচ্ছেন।',
    'There will be no subsequent confirmation prompt for one-click order actions once activated.':
      'চালু হওয়ার পরে ওয়ান-ক্লিক অর্ডার কার্যক্রমের জন্য আর কোনো নিশ্চিতকরণ চাওয়া হবে না।',
    'You agree to accept all risks associated with one-click trading mode, including errors or omissions in submitting orders.':
      'আপনি ওয়ান-ক্লিক ট্রেডিং মোডের সাথে সম্পর্কিত সব ঝুঁকি গ্রহণ করছেন, অর্ডার জমায় ত্রুটি বা বাদ পড়া সহ।',
    'I Accept these Terms and Conditions': 'আমি এই শর্তাবলি গ্রহণ করছি',
    Accept: 'গ্রহণ করুন',
  },
  zh: {
    'Go back': '返回',
    'Loading position...': '正在加载持仓...',
    at: '@',
    'Loading symbols...': '正在加载品种...',
    'No symbols available': '没有可用品种',
    Viewing: '查看中',
    'No open position': '无持仓',
    Selected: '已选择',
    'live view. No open position on this symbol.': '实时查看。该品种没有持仓。',
    'Not set': '未设置',
    Distance: '距离',
    'Est. Loss': '预计亏损',
    'Est. Profit': '预计盈利',
    pts: '点',
    'SL/TP must be at least {points} points away from the market price. Orders are executed by the broker.':
      'SL/TP 必须距市场价格至少 {points} 点。订单由经纪商执行。',
    'No connection': '无连接',
    'Stop Loss must be at least {points} points below the current Bid ({price}) for a buy position.':
      '买入持仓的止损必须低于当前买价（{price}）至少 {points} 点。',
    'Stop Loss must be at least {points} points above the current Ask ({price}) for a sell position.':
      '卖出持仓的止损必须高于当前卖价（{price}）至少 {points} 点。',
    'Take Profit must be at least {points} points above the current Bid ({price}) for a buy position.':
      '买入持仓的止盈必须高于当前买价（{price}）至少 {points} 点。',
    'Take Profit must be at least {points} points below the current Ask ({price}) for a sell position.':
      '卖出持仓的止盈必须低于当前卖价（{price}）至少 {points} 点。',
    'Authentication Error': '身份验证错误',
    'The app does not have a valid local trading session. Log in again before modifying the position.':
      '应用没有有效的本地交易会话。请重新登录后再修改持仓。',
    'Invalid Stop Levels': '止损/止盈水平无效',
    'SL/TP Not Applied': 'SL/TP 未生效',
    'The backend accepted the modify request but did not confirm the requested Stop Loss or Take Profit values. Please refresh positions and try again.':
      '后端已接受修改请求，但未确认所请求的止损或止盈值。请刷新持仓后重试。',
    'Search symbols...': '搜索品种...',
    'Review and confirm closing order': '检查并确认平仓订单',
    'Open Price': '开仓价',
    'Current Price': '当前价',
    'Real-time P/L': '实时盈亏',
    'Order Ticket': '订单编号',
    'Close order submitted. Position closed successfully.': '平仓订单已提交。持仓已成功关闭。',
    'Position Error': '持仓错误',
    'The position ticket is still loading. Return to Trade and select the position again.':
      '持仓编号仍在加载中。请返回交易页面并重新选择该持仓。',
    'The app does not have a valid local trading session. Log in again before closing a position.':
      '应用没有有效的本地交易会话。请重新登录后再平仓。',
    'Select a matching position to pair-close.': '选择一个匹配的持仓进行对冲平仓。',
    'Source Position': '源持仓',
    'No matching positions available for close-by.': '没有可用于对冲平仓的匹配持仓。',
    'Close-by request completed successfully.': '对冲平仓请求已成功完成。',
    'Send Close By Request': '发送对冲平仓请求',
    'The app does not have a valid local trading session. Log in again before using Close By.':
      '应用没有有效的本地交易会话。请重新登录后再使用对冲关闭。',
    'Close Sell Positions': '关闭卖出持仓',
    'Bulk Operation': '批量操作',
    'Close {symbol} Positions': '关闭{symbol}持仓',
    'Affected Positions': '受影响的持仓',
    'Total Exposure P/L': '总敞口盈亏',
    'Active Exposures': '活跃敞口',
    'Net Exposure (USD)': '净敞口（USD）',
    'No positions match this operation.': '没有符合此操作的持仓。',
    'Bulk operation simulated and queued for backend execution.': '批量操作已模拟并加入后端执行队列。',
    'Execute Bulk Operation': '执行批量操作',
    'You are about to activate One Click Trading mode. By clicking Accept the terms below, you acknowledge and agree to bound order submission behavior.':
      '您即将启用一键交易模式。接受以下条款即表示您确认并同意具有约束力的订单提交行为。',
    'There will be no subsequent confirmation prompt for one-click order actions once activated.':
      '启用后，一键订单操作将不再有后续确认提示。',
    'You agree to accept all risks associated with one-click trading mode, including errors or omissions in submitting orders.':
      '您同意承担一键交易模式的全部风险，包括提交订单时的错误或遗漏。',
    'I Accept these Terms and Conditions': '我接受这些条款和条件',
    Accept: '接受',
  },
  ja: {
    'Go back': '戻る',
    'Loading position...': 'ポジションを読み込み中...',
    at: '@',
    'Loading symbols...': '銘柄を読み込み中...',
    'No symbols available': '利用可能な銘柄がありません',
    Viewing: '表示中',
    'No open position': 'オープンポジションなし',
    Selected: '選択中',
    'live view. No open position on this symbol.': 'ライブ表示。この銘柄にオープンポジションはありません。',
    'Not set': '未設定',
    Distance: '距離',
    'Est. Loss': '推定損失',
    'Est. Profit': '推定利益',
    pts: 'ポイント',
    'SL/TP must be at least {points} points away from the market price. Orders are executed by the broker.':
      'SL/TPは市場価格から{points}ポイント以上離す必要があります。注文はブローカーが執行します。',
    'No connection': '接続なし',
    'Stop Loss must be at least {points} points below the current Bid ({price}) for a buy position.':
      '買いポジションの損切りは現在のBid（{price}）より{points}ポイント以上下に設定してください。',
    'Stop Loss must be at least {points} points above the current Ask ({price}) for a sell position.':
      '売りポジションの損切りは現在のAsk（{price}）より{points}ポイント以上上に設定してください。',
    'Take Profit must be at least {points} points above the current Bid ({price}) for a buy position.':
      '買いポジションの利確は現在のBid（{price}）より{points}ポイント以上上に設定してください。',
    'Take Profit must be at least {points} points below the current Ask ({price}) for a sell position.':
      '売りポジションの利確は現在のAsk（{price}）より{points}ポイント以上下に設定してください。',
    'Authentication Error': '認証エラー',
    'The app does not have a valid local trading session. Log in again before modifying the position.':
      'アプリに有効なローカル取引セッションがありません。ポジションを変更する前に再度ログインしてください。',
    'Invalid Stop Levels': '無効なストップレベル',
    'SL/TP Not Applied': 'SL/TPが適用されていません',
    'The backend accepted the modify request but did not confirm the requested Stop Loss or Take Profit values. Please refresh positions and try again.':
      'バックエンドは変更リクエストを受け付けましたが、指定した損切りまたは利確の値を確認できませんでした。ポジションを更新して再試行してください。',
    'Search symbols...': '銘柄を検索...',
    'Review and confirm closing order': '決済注文を確認して確定してください',
    'Open Price': 'オープン価格',
    'Current Price': '現在価格',
    'Real-time P/L': 'リアルタイム損益',
    'Order Ticket': '注文チケット',
    'Close order submitted. Position closed successfully.': '決済注文を送信しました。ポジションは正常に決済されました。',
    'Position Error': 'ポジションエラー',
    'The position ticket is still loading. Return to Trade and select the position again.':
      'ポジションのチケットはまだ読み込み中です。取引に戻ってポジションを選択し直してください。',
    'The app does not have a valid local trading session. Log in again before closing a position.':
      'アプリに有効なローカル取引セッションがありません。ポジションを決済する前に再度ログインしてください。',
    'Select a matching position to pair-close.': '反対決済する対応ポジションを選択してください。',
    'Source Position': '元のポジション',
    'No matching positions available for close-by.': '反対決済に使える対応ポジションがありません。',
    'Close-by request completed successfully.': '反対決済リクエストが正常に完了しました。',
    'Send Close By Request': '反対決済リクエストを送信',
    'The app does not have a valid local trading session. Log in again before using Close By.':
      'アプリに有効なローカル取引セッションがありません。反対決済を使用する前に再度ログインしてください。',
    'Close Sell Positions': '売りポジションを決済',
    'Bulk Operation': '一括操作',
    'Close {symbol} Positions': '{symbol}ポジションを決済',
    'Affected Positions': '対象ポジション',
    'Total Exposure P/L': '合計エクスポージャー損益',
    'Active Exposures': 'アクティブなエクスポージャー',
    'Net Exposure (USD)': 'ネットエクスポージャー（USD）',
    'No positions match this operation.': 'この操作に該当するポジションはありません。',
    'Bulk operation simulated and queued for backend execution.': '一括操作をシミュレートし、バックエンド実行のキューに追加しました。',
    'Execute Bulk Operation': '一括操作を実行',
    'You are about to activate One Click Trading mode. By clicking Accept the terms below, you acknowledge and agree to bound order submission behavior.':
      'ワンクリック取引モードを有効にしようとしています。以下の規約に同意すると、拘束力のある注文送信の動作を確認し同意したことになります。',
    'There will be no subsequent confirmation prompt for one-click order actions once activated.':
      '有効化後、ワンクリック注文操作に対する確認は表示されません。',
    'You agree to accept all risks associated with one-click trading mode, including errors or omissions in submitting orders.':
      '注文送信時の誤りや漏れを含め、ワンクリック取引モードに伴うすべてのリスクを受け入れることに同意します。',
    'I Accept these Terms and Conditions': '本利用規約に同意します',
    Accept: '同意する',
  },
  ko: {
    'Go back': '뒤로',
    'Loading position...': '포지션 불러오는 중...',
    at: '@',
    'Loading symbols...': '종목 불러오는 중...',
    'No symbols available': '사용 가능한 종목 없음',
    Viewing: '보는 중',
    'No open position': '보유 포지션 없음',
    Selected: '선택됨',
    'live view. No open position on this symbol.': '실시간 보기. 이 종목에 보유 포지션이 없습니다.',
    'Not set': '설정 안 됨',
    Distance: '거리',
    'Est. Loss': '예상 손실',
    'Est. Profit': '예상 이익',
    pts: '포인트',
    'SL/TP must be at least {points} points away from the market price. Orders are executed by the broker.':
      'SL/TP는 시장 가격에서 최소 {points}포인트 떨어져 있어야 합니다. 주문은 브로커가 체결합니다.',
    'No connection': '연결 없음',
    'Stop Loss must be at least {points} points below the current Bid ({price}) for a buy position.':
      '매수 포지션의 손절은 현재 Bid({price})보다 최소 {points}포인트 아래여야 합니다.',
    'Stop Loss must be at least {points} points above the current Ask ({price}) for a sell position.':
      '매도 포지션의 손절은 현재 Ask({price})보다 최소 {points}포인트 위여야 합니다.',
    'Take Profit must be at least {points} points above the current Bid ({price}) for a buy position.':
      '매수 포지션의 이익실현은 현재 Bid({price})보다 최소 {points}포인트 위여야 합니다.',
    'Take Profit must be at least {points} points below the current Ask ({price}) for a sell position.':
      '매도 포지션의 이익실현은 현재 Ask({price})보다 최소 {points}포인트 아래여야 합니다.',
    'Authentication Error': '인증 오류',
    'The app does not have a valid local trading session. Log in again before modifying the position.':
      '앱에 유효한 로컬 거래 세션이 없습니다. 포지션을 수정하기 전에 다시 로그인하세요.',
    'Invalid Stop Levels': '유효하지 않은 스톱 레벨',
    'SL/TP Not Applied': 'SL/TP 미적용',
    'The backend accepted the modify request but did not confirm the requested Stop Loss or Take Profit values. Please refresh positions and try again.':
      '백엔드가 수정 요청을 수락했지만 요청한 손절 또는 이익실현 값을 확인하지 못했습니다. 포지션을 새로고침한 후 다시 시도하세요.',
    'Search symbols...': '종목 검색...',
    'Review and confirm closing order': '청산 주문을 검토하고 확인하세요',
    'Open Price': '진입 가격',
    'Current Price': '현재 가격',
    'Real-time P/L': '실시간 손익',
    'Order Ticket': '주문 티켓',
    'Close order submitted. Position closed successfully.': '청산 주문이 제출되었습니다. 포지션이 성공적으로 청산되었습니다.',
    'Position Error': '포지션 오류',
    'The position ticket is still loading. Return to Trade and select the position again.':
      '포지션 티켓을 아직 불러오는 중입니다. 거래로 돌아가 포지션을 다시 선택하세요.',
    'The app does not have a valid local trading session. Log in again before closing a position.':
      '앱에 유효한 로컬 거래 세션이 없습니다. 포지션을 청산하기 전에 다시 로그인하세요.',
    'Select a matching position to pair-close.': '상대 청산할 일치하는 포지션을 선택하세요.',
    'Source Position': '원본 포지션',
    'No matching positions available for close-by.': '상대 청산에 사용할 일치하는 포지션이 없습니다.',
    'Close-by request completed successfully.': '상대 청산 요청이 성공적으로 완료되었습니다.',
    'Send Close By Request': '상대 청산 요청 보내기',
    'The app does not have a valid local trading session. Log in again before using Close By.':
      '앱에 유효한 로컬 거래 세션이 없습니다. 상대 청산을 사용하기 전에 다시 로그인하세요.',
    'Close Sell Positions': '매도 포지션 청산',
    'Bulk Operation': '일괄 작업',
    'Close {symbol} Positions': '{symbol} 포지션 청산',
    'Affected Positions': '영향받는 포지션',
    'Total Exposure P/L': '총 익스포저 손익',
    'Active Exposures': '활성 익스포저',
    'Net Exposure (USD)': '순 익스포저(USD)',
    'No positions match this operation.': '이 작업과 일치하는 포지션이 없습니다.',
    'Bulk operation simulated and queued for backend execution.': '일괄 작업이 시뮬레이션되어 백엔드 실행 대기열에 추가되었습니다.',
    'Execute Bulk Operation': '일괄 작업 실행',
    'You are about to activate One Click Trading mode. By clicking Accept the terms below, you acknowledge and agree to bound order submission behavior.':
      '원클릭 거래 모드를 활성화하려고 합니다. 아래 약관에 동의하면 구속력 있는 주문 제출 방식을 인지하고 동의하는 것입니다.',
    'There will be no subsequent confirmation prompt for one-click order actions once activated.':
      '활성화 후에는 원클릭 주문 작업에 대한 추가 확인 창이 표시되지 않습니다.',
    'You agree to accept all risks associated with one-click trading mode, including errors or omissions in submitting orders.':
      '주문 제출 시 오류나 누락을 포함하여 원클릭 거래 모드와 관련된 모든 위험을 수용하는 데 동의합니다.',
    'I Accept these Terms and Conditions': '본 이용약관에 동의합니다',
    Accept: '동의',
  },
  id: {
    'Go back': 'Kembali',
    'Loading position...': 'Memuat posisi...',
    at: 'di',
    'Loading symbols...': 'Memuat simbol...',
    'No symbols available': 'Tidak ada simbol tersedia',
    Viewing: 'Melihat',
    'No open position': 'Tidak ada posisi terbuka',
    Selected: 'Terpilih',
    'live view. No open position on this symbol.': 'tampilan langsung. Tidak ada posisi terbuka pada simbol ini.',
    'Not set': 'Belum diatur',
    Distance: 'Jarak',
    'Est. Loss': 'Perkiraan rugi',
    'Est. Profit': 'Perkiraan profit',
    pts: 'poin',
    'SL/TP must be at least {points} points away from the market price. Orders are executed by the broker.':
      'SL/TP harus berjarak minimal {points} poin dari harga pasar. Order dieksekusi oleh broker.',
    'No connection': 'Tidak ada koneksi',
    'Stop Loss must be at least {points} points below the current Bid ({price}) for a buy position.':
      'Stop Loss harus minimal {points} poin di bawah Bid saat ini ({price}) untuk posisi buy.',
    'Stop Loss must be at least {points} points above the current Ask ({price}) for a sell position.':
      'Stop Loss harus minimal {points} poin di atas Ask saat ini ({price}) untuk posisi sell.',
    'Take Profit must be at least {points} points above the current Bid ({price}) for a buy position.':
      'Take Profit harus minimal {points} poin di atas Bid saat ini ({price}) untuk posisi buy.',
    'Take Profit must be at least {points} points below the current Ask ({price}) for a sell position.':
      'Take Profit harus minimal {points} poin di bawah Ask saat ini ({price}) untuk posisi sell.',
    'Authentication Error': 'Kesalahan autentikasi',
    'The app does not have a valid local trading session. Log in again before modifying the position.':
      'Aplikasi tidak memiliki sesi trading lokal yang valid. Masuk lagi sebelum mengubah posisi.',
    'Invalid Stop Levels': 'Level stop tidak valid',
    'SL/TP Not Applied': 'SL/TP tidak diterapkan',
    'The backend accepted the modify request but did not confirm the requested Stop Loss or Take Profit values. Please refresh positions and try again.':
      'Backend menerima permintaan perubahan tetapi tidak mengonfirmasi nilai Stop Loss atau Take Profit yang diminta. Segarkan posisi dan coba lagi.',
    'Search symbols...': 'Cari simbol...',
    'Review and confirm closing order': 'Tinjau dan konfirmasi order penutupan',
    'Open Price': 'Harga buka',
    'Current Price': 'Harga saat ini',
    'Real-time P/L': 'P/L real-time',
    'Order Ticket': 'Tiket order',
    'Close order submitted. Position closed successfully.': 'Order penutupan terkirim. Posisi berhasil ditutup.',
    'Position Error': 'Kesalahan posisi',
    'The position ticket is still loading. Return to Trade and select the position again.':
      'Tiket posisi masih dimuat. Kembali ke Trading dan pilih posisi lagi.',
    'The app does not have a valid local trading session. Log in again before closing a position.':
      'Aplikasi tidak memiliki sesi trading lokal yang valid. Masuk lagi sebelum menutup posisi.',
    'Select a matching position to pair-close.': 'Pilih posisi yang cocok untuk penutupan berpasangan.',
    'Source Position': 'Posisi sumber',
    'No matching positions available for close-by.': 'Tidak ada posisi yang cocok untuk close-by.',
    'Close-by request completed successfully.': 'Permintaan close-by berhasil diselesaikan.',
    'Send Close By Request': 'Kirim permintaan Close By',
    'The app does not have a valid local trading session. Log in again before using Close By.':
      'Aplikasi tidak memiliki sesi trading lokal yang valid. Masuk lagi sebelum menggunakan Close By.',
    'Close Sell Positions': 'Tutup posisi sell',
    'Bulk Operation': 'Operasi massal',
    'Close {symbol} Positions': 'Tutup posisi {symbol}',
    'Affected Positions': 'Posisi terdampak',
    'Total Exposure P/L': 'P/L eksposur total',
    'Active Exposures': 'Eksposur aktif',
    'Net Exposure (USD)': 'Eksposur bersih (USD)',
    'No positions match this operation.': 'Tidak ada posisi yang cocok dengan operasi ini.',
    'Bulk operation simulated and queued for backend execution.': 'Operasi massal disimulasikan dan diantrekan untuk eksekusi backend.',
    'Execute Bulk Operation': 'Jalankan operasi massal',
    'You are about to activate One Click Trading mode. By clicking Accept the terms below, you acknowledge and agree to bound order submission behavior.':
      'Anda akan mengaktifkan mode Trading sekali klik. Dengan menerima ketentuan di bawah, Anda mengakui dan menyetujui perilaku pengiriman order yang mengikat.',
    'There will be no subsequent confirmation prompt for one-click order actions once activated.':
      'Setelah diaktifkan, tidak akan ada konfirmasi lanjutan untuk aksi order sekali klik.',
    'You agree to accept all risks associated with one-click trading mode, including errors or omissions in submitting orders.':
      'Anda setuju menerima semua risiko terkait mode trading sekali klik, termasuk kesalahan atau kelalaian dalam pengiriman order.',
    'I Accept these Terms and Conditions': 'Saya menerima Syarat dan Ketentuan ini',
    Accept: 'Terima',
  },
};
