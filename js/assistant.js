/* ============================================================
   AI-Solutions — Virtual Assistant (Aria)
   ─────────────────────────────────────────────────────────
   Self-contained widget: injects HTML + initialises chat.

   TO CONNECT YOUR AI API:
   Replace the body of  callAIAPI(message, sessionId)
   with a fetch() to your endpoint, e.g.:

     const res = await fetch('/api/assistant/chat', {
       method: 'POST',
       headers: { 'Content-Type': 'application/json' },
       body: JSON.stringify({ message, session_id: sessionId })
     });
     const data = await res.json();
     return data.reply;               // string

   ============================================================ */

(function () {
  'use strict';

  /* ----------------------------------------------------------
     1. INJECT WIDGET HTML
  ---------------------------------------------------------- */
  const WIDGET_HTML = `
<div class="va-container" id="vaContainer" aria-label="AI Assistant">

  <!-- Floating toggle button -->
  <button class="va-toggle" id="vaToggle" aria-label="Open AI Assistant" aria-expanded="false">
    <i class="fas fa-robot" id="vaIconOpen"></i>
    <i class="fas fa-times" id="vaIconClose" style="display:none"></i>
    <span class="va-badge" id="vaBadge" style="display:none">1</span>
  </button>

  <!-- Chat panel -->
  <div class="va-panel hidden" id="vaPanel" role="dialog" aria-label="Aria — AI Assistant">

    <!-- Header -->
    <div class="va-header">
      <div class="va-avatar-wrap">
        <div class="va-avatar"><i class="fas fa-robot"></i></div>
        <span class="va-online"></span>
      </div>
      <div class="va-header-text">
        <div class="va-name">Prashant</div>
        <div class="va-status">AI Assistant &middot; Online</div>
      </div>
      <div class="va-header-actions">
        <button class="va-header-btn" id="vaMinimise" aria-label="Minimise chat" title="Minimise">
          <i class="fas fa-minus"></i>
        </button>
        <button class="va-header-btn" id="vaClose" aria-label="Close chat" title="Close">
          <i class="fas fa-times"></i>
        </button>
      </div>
    </div>

    <!-- Messages -->
    <div class="va-messages" id="vaMessages" aria-live="polite" aria-atomic="false"></div>

    <!-- Quick replies -->
    <div class="va-quick-replies" id="vaQuickReplies">
      <button class="va-chip" data-msg="What services do you offer?">Our services</button>
      <button class="va-chip" data-msg="Tell me about past projects">Portfolio</button>
      <button class="va-chip" data-msg="How do I contact the team?">Contact</button>
      <button class="va-chip" data-msg="Where are you based?">Location</button>
    </div>

    <!-- Input row -->
    <div class="va-input-row">
      <input
        type="text"
        class="va-input"
        id="vaInput"
        placeholder="Ask me anything…"
        maxlength="400"
        autocomplete="off"
        aria-label="Type your message"
      />
      <button class="va-send" id="vaSend" aria-label="Send message">
        <i class="fas fa-paper-plane"></i>
      </button>
    </div>

    <div class="va-foot">
      Powered by <strong>AI-Solutions</strong> &middot; <a href="../contact.html">Contact team</a>
    </div>

  </div><!-- /.va-panel -->
</div>
`;

  document.body.insertAdjacentHTML('beforeend', WIDGET_HTML);

  /* ----------------------------------------------------------
     2. STATE
  ---------------------------------------------------------- */
  let isOpen    = false;
  let isBusy    = false;
  let sessionId = sessionStorage.getItem('aria_sid') || genId();
  sessionStorage.setItem('aria_sid', sessionId);

  const panel     = document.getElementById('vaPanel');
  const messages  = document.getElementById('vaMessages');
  const input     = document.getElementById('vaInput');
  const sendBtn   = document.getElementById('vaSend');
  const badge     = document.getElementById('vaBadge');
  const iconOpen  = document.getElementById('vaIconOpen');
  const iconClose = document.getElementById('vaIconClose');
  const toggleBtn = document.getElementById('vaToggle');

  let hasShownGreeting = false;

  /* ----------------------------------------------------------
     3. OPEN / CLOSE
  ---------------------------------------------------------- */
  toggleBtn.addEventListener('click', () => isOpen ? close() : open());
  document.getElementById('vaMinimise').addEventListener('click', close);
  document.getElementById('vaClose').addEventListener('click',    close);

  function open() {
    isOpen = true;
    panel.classList.remove('hidden');
    panel.classList.add('visible');
    toggleBtn.classList.add('open');
    iconOpen.style.display  = 'none';
    iconClose.style.display = '';
    toggleBtn.setAttribute('aria-expanded', 'true');
    badge.style.display = 'none';

    if (!hasShownGreeting) {
      hasShownGreeting = true;
      setTimeout(() => {
        showTyping();
        setTimeout(() => {
          removeTyping();
          addBotMessage(
            "👋 Hi there! I'm <strong>Prashant</strong>, the AI-Solutions virtual assistant. " +
            "I can tell you about our services, past projects, team, events, and more.<br/>" +
            "What would you like to know today?"
          );
        }, 1200);
      }, 300);
    }

    setTimeout(() => {
      messages.scrollTop = messages.scrollHeight;
      input.focus();
    }, 320);
  }

  function close() {
    isOpen = false;
    panel.classList.remove('visible');
    panel.classList.add('hidden');
    toggleBtn.classList.remove('open');
    iconOpen.style.display  = '';
    iconClose.style.display = 'none';
    toggleBtn.setAttribute('aria-expanded', 'false');
  }

  /* Show greeting badge after 4 s if user hasn't opened yet */
  setTimeout(() => {
    if (!isOpen && !hasShownGreeting) badge.style.display = 'flex';
  }, 4000);

  /* ----------------------------------------------------------
     4. SEND MESSAGE
  ---------------------------------------------------------- */
  sendBtn.addEventListener('click', handleSend);
  input.addEventListener('keydown', e => { if (e.key === 'Enter' && !e.shiftKey) handleSend(); });

  /* Quick reply chips */
  document.querySelectorAll('.va-chip[data-msg]').forEach(btn => {
    btn.addEventListener('click', () => {
      if (!isOpen) open();
      setTimeout(() => sendMessage(btn.dataset.msg), 200);
    });
  });

  function handleSend() {
    const text = input.value.trim();
    if (!text || isBusy) return;
    input.value = '';
    sendMessage(text);
  }

  async function sendMessage(text) {
    if (isBusy) return;
    isBusy = true;
    setBusy(true);

    addUserMessage(text);
    hideQuickReplies();
    showTyping();
    messages.scrollTop = messages.scrollHeight;

    try {
      /* ── CALL AI API ── plug your endpoint in callAIAPI() below ── */
      const reply = await callAIAPI(text, sessionId);
      removeTyping();
      addBotMessage(reply);
    } catch (err) {
      removeTyping();
      addBotMessage("Sorry, I'm having a little trouble right now. Please try again in a moment, or <a href='contact.html' style='color:var(--blue)'>contact the team</a> directly.");
      console.error('[Prashant]', err);
    } finally {
      isBusy = false;
      setBusy(false);
      messages.scrollTop = messages.scrollHeight;
      input.focus();
    }
  }

  /* ----------------------------------------------------------
     5. CALL AI API
     ──────────────────────────────────────────────────────
     Replace the body of this function with your real API
     call when the API is ready.  The function must return
     a Promise<string> (the reply text / HTML snippet).
     ──────────────────────────────────────────────────────
  ---------------------------------------------------------- */
  async function callAIAPI(message, sid) {
    const res = await fetch('/api/assistant/chat', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ message, session_id: sid }),
    });
    if (!res.ok) throw new Error(`API error ${res.status}`);
    const data = await res.json();
    return data.reply;
  }

  /* ----------------------------------------------------------
     6. LOCAL FALLBACK RESPONSES (keyword matching)
     Remove or keep as fallback when real API is wired up.
  ---------------------------------------------------------- */
  function localRespond(text) {
    const q = text.toLowerCase();

    if (match(q, ['hello','hi','hey','howdy','good morning','good afternoon','good evening'])) {
      return "Hello! 👋 Great to hear from you. How can I help you today? You can ask me about our <b>services</b>, <b>past projects</b>, <b>team</b>, <b>events</b>, or how to <b>get in touch</b>.";
    }
    if (match(q, ['service','offer','solution','platform','product','what do you do'])) {
      return "AI-Solutions offers four core services:<br/>" +
        "🔹 <b>Data Foundation</b> — quality data pipelines<br/>" +
        "🔹 <b>Model & Agent Orchestration</b> — fine-tuning & deployment<br/>" +
        "🔹 <b>Trust & Oversight</b> — guardrails & human review<br/>" +
        "🔹 <b>Enablement & APIs</b> — SDKs, dashboards & integrations<br/><br/>" +
        "Want to <a href='services.html' style='color:var(--blue)'>explore all services</a>?";
    }
    if (match(q, ['project','portfolio','past','work','client','case','delivered','built'])) {
      return "We've delivered 5 flagship AI systems:<br/>" +
        "🏥 <b>HealthSync AI</b> — Healthcare workflow platform<br/>" +
        "🛒 <b>RetailMind</b> — Retail analytics & intelligence<br/>" +
        "🎓 <b>EduNova</b> — Adaptive learning management<br/>" +
        "🚛 <b>FleetPilot AI</b> — Logistics optimisation<br/>" +
        "🔒 <b>SecureVision</b> — AI surveillance & security<br/><br/>" +
        "<a href='portfolio.html' style='color:var(--blue)'>View full portfolio →</a>";
    }
    if (match(q, ['contact','reach','email','phone','call','talk','speak','meeting','demo'])) {
      return "You can reach our team through several channels:<br/>" +
        "📧 <b>hello@ai-solutions.co.uk</b><br/>" +
        "📞 <b>+44 (0)191 555 0100</b><br/>" +
        "🏢 12 Innovation Quarter, Sunderland, SR1 3EN<br/><br/>" +
        "Or <a href='contact.html' style='color:var(--blue)'>fill in our contact form</a> and we'll reply within 1 business day.";
    }
    if (match(q, ['location','where','based','address','office','sunderland','uk','united kingdom'])) {
      return "AI-Solutions is headquartered at:<br/>" +
        "🏢 <b>12 Innovation Quarter</b><br/>Sunderland, SR1 3EN<br/>United Kingdom<br/><br/>" +
        "We work with clients across the UK and internationally. Our team operates Mon–Fri, 09:00–17:30 GMT.";
    }
    if (match(q, ['price','cost','pricing','quote','budget','fee','rate','charge'])) {
      return "Pricing depends on the scope, scale, and specific requirements of your project. We offer flexible models including project-based, retainer, and platform licences.<br/><br/>" +
        "The best way to get a tailored quote is to <a href='contact.html' style='color:var(--blue)'>book a free consultation</a> with our team. 📞";
    }
    if (match(q, ['team','who','people','founder','staff','employee','about'])) {
      return "AI-Solutions was founded in Sunderland, UK, by a team of AI researchers, engineers, and industry experts. Our diverse team spans data science, machine learning, software engineering, UX, and enterprise consulting.<br/><br/>" +
        "<a href='about.html' style='color:var(--blue)'>Meet the team →</a>";
    }
    if (match(q, ['event','webinar','conference','workshop','upcoming','calendar','schedule'])) {
      return "We have several upcoming events:<br/>" +
        "📅 <b>18 Jul</b> — AI & Enterprise Summit, London<br/>" +
        "📅 <b>5 Aug</b> — Healthcare AI Workshop, Sunderland<br/>" +
        "📅 <b>22 Aug</b> — Responsible AI Webinar (Online, free)<br/>" +
        "📅 <b>4 Oct</b> — Annual Showcase, Sunderland<br/><br/>" +
        "<a href='events.html' style='color:var(--blue)'>See full events timeline →</a>";
    }
    if (match(q, ['testimonial','review','rating','feedback','opinion','client say','customer say'])) {
      return "Our clients love the results! Average rating: <b>⭐ 4.8/5</b> across 500+ reviews.<br/><br/>" +
        "Highlights:<br/>" +
        "❝ <em>HealthSync AI improved our operations significantly</em> ❞ — Dr. Melissa Carter<br/>" +
        "❝ <em>EduNova transformed our students' learning</em> ❞ — Priya Sharma<br/><br/>" +
        "<a href='testimonials.html' style='color:var(--blue)'>Read all reviews →</a>";
    }
    if (match(q, ['blog','article','news','insight','read','resource'])) {
      return "Check out our latest insights on the <a href='blog.html' style='color:var(--blue)'>AI-Solutions Blog →</a>.<br/><br/>" +
        "Recent articles:<br/>" +
        "📄 Why production AI fails — and how to build systems that don't<br/>" +
        "📄 How HealthSync AI reduced waiting times by 40%<br/>" +
        "📄 AI-driven inventory optimisation: the RetailMind story";
    }
    if (match(q, ['gdpr','compliance','security','iso','data protection','privacy','safe','certif'])) {
      return "We take compliance very seriously. AI-Solutions platforms are built to be:<br/>" +
        "✅ <b>GDPR-compliant</b> — data handled per UK & EU regulations<br/>" +
        "✅ <b>ISO 27001 ready</b> — aligned with information security standards<br/>" +
        "✅ <b>Auditable</b> — full decision logs & explainability<br/><br/>" +
        "Specific compliance requirements? <a href='contact.html' style='color:var(--blue)'>Talk to our team →</a>";
    }
    if (match(q, ['thank','thanks','cheers','appreciate','great','helpful','perfect','awesome'])) {
      return "You're very welcome! 😊 If you need anything else, I'm right here. You can also <a href='contact.html' style='color:var(--blue)'>contact the team</a> for more detailed assistance.";
    }
    if (match(q, ['bye','goodbye','see you','later','done','exit','close'])) {
      return "Thanks for chatting! 👋 If you ever have more questions, just click the chat button. Have a great day!";
    }
    if (match(q, ['health','healthcare','hospital','medical','patient','clinical','nhs'])) {
      return "Our <b>HealthSync AI</b> platform helps healthcare organisations:<br/>" +
        "🏥 Automate appointment scheduling<br/>" +
        "🏥 Predict patient risk alerts<br/>" +
        "🏥 Synchronise records in real-time<br/>" +
        "🏥 AI-assisted diagnostics<br/>" +
        "🏥 Wearable device integration<br/><br/>" +
        "Trusted by Horizon Care Group with a <b>4.8★</b> rating.";
    }
    if (match(q, ['retail','shop','store','ecommerce','inventory','sales','customer behaviour'])) {
      return "<b>RetailMind</b> delivers AI-powered retail analytics:<br/>" +
        "🛒 Customer movement tracking<br/>" +
        "🛒 Sales forecasting & inventory optimisation<br/>" +
        "🛒 Product placement recommendations<br/>" +
        "🛒 POS and CRM integration<br/><br/>" +
        "Clients report revenue uplifts and 35% less overstock.";
    }
    if (match(q, ['fleet','truck','vehicle','logistics','delivery','transport','route','fuel'])) {
      return "<b>FleetPilot AI</b> optimises transportation operations:<br/>" +
        "🚛 Live vehicle tracking<br/>" +
        "🚛 AI route optimisation<br/>" +
        "🚛 Fuel prediction analytics<br/>" +
        "🚛 Driver performance insights<br/>" +
        "🚛 Delivery scheduling automation<br/><br/>" +
        "SwiftMove Logistics saved over £2M in fuel costs.";
    }
    if (match(q, ['educat','student','learning','school','college','university','course','train'])) {
      return "<b>EduNova</b> is our adaptive learning platform:<br/>" +
        "🎓 Personalised learning modules<br/>" +
        "🎓 Automated grading & AI-generated quizzes<br/>" +
        "🎓 Student engagement analytics<br/>" +
        "🎓 Multilingual support<br/><br/>" +
        "Rated <b>4.9★</b> by Nova International College.";
    }
    if (match(q, ['security','surveillance','cctv','camera','threat','facial','monitor','secure'])) {
      return "<b>SecureVision</b> is our AI security platform:<br/>" +
        "🔒 Real-time threat detection<br/>" +
        "🔒 Facial recognition access control<br/>" +
        "🔒 Suspicious activity alerts<br/>" +
        "🔒 Cloud-based security analytics<br/>" +
        "🔒 Remote monitoring dashboard<br/><br/>" +
        "Response times reduced by 60% at Nexa Corporate Solutions.";
    }

    /* Default fallback */
    return "That's a great question! I may not have all the details on that specific topic, but our team definitely can help.<br/><br/>" +
      "📞 <b>Call us:</b> +44 (0)191 555 0100<br/>" +
      "📧 <b>Email:</b> hello@ai-solutions.co.uk<br/>" +
      "💬 <a href='contact.html' style='color:var(--blue)'>Send us a message →</a>";
  }

  function match(text, keywords) {
    return keywords.some(k => text.includes(k));
  }

  /* ----------------------------------------------------------
     7. DOM HELPERS
  ---------------------------------------------------------- */
  function addBotMessage(html) {
    const el = document.createElement('div');
    el.className = 'va-msg bot';
    el.innerHTML = `
      <div class="va-bubble">${html}</div>
      <div class="va-msg-time">${timeNow()}</div>
    `;
    messages.appendChild(el);
    messages.scrollTop = messages.scrollHeight;
  }

  function addUserMessage(text) {
    const el = document.createElement('div');
    el.className = 'va-msg user';
    el.innerHTML = `
      <div class="va-bubble">${escHtml(text)}</div>
      <div class="va-msg-time">${timeNow()}</div>
    `;
    messages.appendChild(el);
    messages.scrollTop = messages.scrollHeight;
  }

  let typingEl = null;
  function showTyping() {
    typingEl = document.createElement('div');
    typingEl.className = 'va-msg bot va-typing';
    typingEl.id = 'vaTypingIndicator';
    typingEl.innerHTML = `
      <div class="va-bubble">
        <span class="typing-dot"></span>
        <span class="typing-dot"></span>
        <span class="typing-dot"></span>
      </div>
    `;
    messages.appendChild(typingEl);
    messages.scrollTop = messages.scrollHeight;
  }

  function removeTyping() {
    document.getElementById('vaTypingIndicator')?.remove();
    typingEl = null;
  }

  function hideQuickReplies() {
    document.getElementById('vaQuickReplies').style.display = 'none';
  }

  function setBusy(busy) {
    sendBtn.disabled = busy;
    input.disabled   = busy;
  }

  function escHtml(str) {
    return str.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }

  function timeNow() {
    return new Date().toLocaleTimeString('en-GB', { hour:'2-digit', minute:'2-digit' });
  }

  function delay(ms) { return new Promise(r => setTimeout(r, ms)); }

  function genId() {
    return 'aria_' + Math.random().toString(36).slice(2,10) + Date.now();
  }

})(); // end IIFE
