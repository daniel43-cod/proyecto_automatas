// pda.js
// Simulador para L = { a^n b^m x y* c^m a^n | n >= 2, m >= 1 }

(() => {
  // DOM
  const input = document.getElementById('inputString');
  const runBtn = document.getElementById('runBtn');
  const stepBtn = document.getElementById('stepBtn');
  const resetBtn = document.getElementById('resetBtn');
  const stateDisplay = document.getElementById('stateDisplay');
  const resultDisplay = document.getElementById('resultDisplay');
  const stackView = document.getElementById('stackView');
  const traceView = document.getElementById('traceView');
  const samples = document.querySelectorAll('.sample');

  // PDA internal state
  let tape = '';
  let pos = 0;
  let state = 'q0';
  let stack = [];
  let trace = []; // array of {state, remaining, stackSnapshot}
  let modeStep = false;
  let halted = false;

  // Counters for verifying n>=2 and m>=1 etc
  let initialACount = 0;
  let bCount = 0;
  let cCount = 0;
  let finalACount = 0;

  // helper
  function resetAll(){
    tape = '';
    pos = 0;
    state = 'q0';
    stack = ['Z0'];
    trace = [];
    modeStep = false;
    halted = false;
    initialACount = 0; bCount = 0; cCount = 0; finalACount = 0;
    render();
  }

  function snapshot(){
    return {
      state,
      remaining: tape.slice(pos),
      stack: stack.slice()
    };
  }

  function push(sym){ stack.push(sym); }
  function pop(){
    if(stack.length<=0) return null;
    return stack.pop();
  }
  function top(){ return stack[stack.length-1]; }

  function render(){
    stateDisplay.textContent = state;
    // stack
    stackView.innerHTML = '';
    stack.forEach(s => {
      const d = document.createElement('div');
      d.className = 'cell';
      d.textContent = s;
      stackView.appendChild(d);
    });
    // trace
    traceView.innerHTML = '';
    trace.forEach((t,i) => {
      const li = document.createElement('li');
      li.textContent = `(${t.state}, "${t.remaining}", [${t.stack.join(',')}] )`;
      traceView.appendChild(li);
    });
  }

  // Main full-run function
  function runOnce(inputStr){
    resetAll();
    tape = inputStr.trim();
    // validate allowed symbols
    if(!/^[abycx]*$/.test(tape)){
      resultDisplay.textContent = 'Error: símbolos no válidos. Sólo: a b x y c';
      resultDisplay.style.color = 'crimson';
      return;
    }
    // start
    trace.push(snapshot());
    // run loop
    while(!halted){
      step();
    }
  }

  function step(){
    // if halted, do nothing
    if(halted) return;
    // If modeStep, will stop after one internal transition
    // If pos > length and in acceptance condition we may accept
    // guard end
    const sym = tape[pos] || ''; // '' == end of tape

    // State machine transitions
    if(state === 'q0'){
      if(sym === 'a'){
        // push A for each initial a
        push('A'); initialACount++;
        pos++;
        trace.push(snapshot());
      } else if(sym === 'b'){
        // move to q1 if we have seen at least one 'a' (but n>=2 check later)
        state = 'q1';
        trace.push(snapshot());
      } else {
        // invalid symbol at this stage
        reject(`En q0 se esperaba 'a' o 'b' (inicio). Encontrado: '${sym || 'EOF'}'`);
        return;
      }
    }
    else if(state === 'q1'){
      if(sym === 'b'){
        push('B'); bCount++;
        pos++;
        trace.push(snapshot());
      } else if(sym === 'x'){
        // must have at least one b (m>=1)
        if(bCount < 1){ reject('Rechazado: se requiere m ≥ 1 (al menos una b antes de x)'); return; }
        pos++;
        state = 'q2';
        trace.push(snapshot());
      } else {
        reject(`En q1 se esperaba 'b' o 'x'. Encontrado: '${sym || 'EOF'}'`);
        return;
      }
    }
    else if(state === 'q2'){
      // after x: skip y* or if see c start popping B
      if(sym === 'y'){
        pos++;
        trace.push(snapshot());
      } else if(sym === 'c'){
        // start popping B; require top B
        if(top() !== 'B'){
          reject('Rechazado: al empezar a leer c no hay marcas B en la pila (conteo m no coincide).');
          return;
        }
        // move to q3 but do not consume here? we'll consume in q3 handler to pop
        state = 'q3';
        trace.push(snapshot());
      } else {
        reject(`En q2 se esperaba 'y' o 'c' (tras x). Encontrado: '${sym || 'EOF'}'`);
        return;
      }
    }
    else if(state === 'q3'){
      if(sym === 'c'){
        if(top() === 'B'){
          pop(); cCount++;
          pos++;
          trace.push(snapshot());
        } else {
          reject('Rechazado: encontró c pero tope de pila no es B.');
          return;
        }
      } else if(sym === 'a'){
        // must have popped all Bs (cCount must equal bCount)
        if(bCount !== cCount){
          reject(`Rechazado: número de c (${cCount}) no igual número de b (${bCount}).`);
          return;
        }
        // also ensure at least one c (m>=1)
        if(cCount < 1){
          reject('Rechazado: se requiere al menos un c (m ≥ 1).');
          return;
        }
        // move to final a-reading state
        state = 'q4';
        trace.push(snapshot());
      } else {
        reject(`En q3 se esperaba 'c' o 'a'. Encontrado: '${sym || 'EOF'}'`);
        return;
      }
    }
    else if(state === 'q4'){
      if(sym === 'a'){
        if(top() === 'A'){
          pop(); finalACount++;
          pos++;
          trace.push(snapshot());
        } else {
          reject('Rechazado: al leer a final no hay A para desapilar (n no coincide).');
          return;
        }
      } else if(sym === ''){
        // end of tape: accept only if stack==['Z0'] and initialACount==finalACount and initialACount>=2
        if(stack.length === 1 && stack[0] === 'Z0'){
          if(initialACount !== finalACount){
            reject(`Rechazado: número final de a (${finalACount}) != inicial de a (${initialACount}).`);
            return;
          }
          if(initialACount < 2){
            reject('Rechazado: se requiere n ≥ 2 (mínimo dos a iniciales).');
            return;
          }
          accept();
          return;
        } else {
          // maybe there are leftover As -> if so, we need to pop them but input is ended -> reject
          reject('Rechazado: entrada terminada pero la pila no volvió a Z0.');
          return;
        }
      } else {
        reject(`En q4 se esperaba 'a' o fin de cadena. Encontrado: '${sym}'`);
        return;
      }
    }
    else {
      reject('Estado desconocido');
      return;
    }

    // if modeStep true, pause after single internal transition
    if(modeStep) halted = true;

    // If pos beyond length and not in q4 might be error; handle on next step
  }

  function accept(){
    state = 'qf';
    trace.push(snapshot());
    resultDisplay.textContent = 'Cadena ACEPTADA';
    resultDisplay.style.color = 'green';
    halted = true;
    render();
  }

  function reject(msg){
    resultDisplay.textContent = 'Cadena RECHAZADA — ' + msg;
    resultDisplay.style.color = 'crimson';
    halted = true;
    render();
  }

  // UI events
  runBtn.addEventListener('click', () => {
    const s = input.value.trim();
    resultDisplay.textContent = 'Procesando...';
    resultDisplay.style.color = 'black';
    modeStep = false;
    runOnce(s);
    render();
  });

  stepBtn.addEventListener('click', () => {
    if(!tape){
      tape = input.value.trim();
      // quick validate
      if(!/^[abycx]*$/.test(tape)){
        resultDisplay.textContent = 'Error: símbolos no válidos. Sólo: a b x y c';
        resultDisplay.style.color = 'crimson';
        return;
      }
      // prepare only if not started
      resetAll();
      tape = input.value.trim();
      trace.push(snapshot());
    }
    modeStep = true;
    halted = false;
    step();
    render();
  });

  resetBtn.addEventListener('click', () => {
    resetAll();
    resultDisplay.textContent = '-';
    resultDisplay.style.color = 'black';
    input.value = '';
  });

  // sample buttons
  samples.forEach(b => {
    b.addEventListener('click', () => {
      input.value = b.dataset.val;
    });
  });

  // inicializar
  resetAll();
})();


