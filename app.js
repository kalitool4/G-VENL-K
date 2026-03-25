const imeiInput = document.getElementById("imeiInput");
const apiEndpointInput = document.getElementById("apiEndpoint");
const apiKeyInput = document.getElementById("apiKey");
const queryBtn = document.getElementById("queryBtn");
const fillSampleBtn = document.getElementById("fillSampleBtn");
const copyPromptBtn = document.getElementById("copyPromptBtn");
const statusEl = document.getElementById("status");
const registeredList = document.getElementById("registeredList");
const unregisteredList = document.getElementById("unregisteredList");
const registeredCount = document.getElementById("registeredCount");
const unregisteredCount = document.getElementById("unregisteredCount");
const promptOutput = document.getElementById("promptOutput");
const resultItemTemplate = document.getElementById("resultItemTemplate");

const SAMPLE_IMEIS = ["356938035643809", "490154203237518", "352099001761481"];

fillSampleBtn.addEventListener("click", () => {
  imeiInput.value = SAMPLE_IMEIS.join("\n");
});

queryBtn.addEventListener("click", async () => {
  const imeis = sanitizeImeis(imeiInput.value);
  if (!imeis.length) {
    setStatus("Lütfen en az 1 adet geçerli IMEI girin.");
    return;
  }

  clearResults();
  setLoading(true);
  setStatus(`${imeis.length} IMEI sorgulanıyor...`);

  const endpoint = apiEndpointInput.value.trim();
  const apiKey = apiKeyInput.value.trim();

  const results = await Promise.all(
    imeis.map((imei) => querySingleImei({ imei, endpoint, apiKey }))
  );

  const registered = results.filter((x) => x.registered);
  const unregistered = results.filter((x) => !x.registered);

  renderResults(registeredList, registered, false);
  renderResults(unregisteredList, unregistered, true);

  registeredCount.textContent = String(registered.length);
  unregisteredCount.textContent = String(unregistered.length);

  buildChatGptPrompt(registered, unregistered);

  setStatus(
    `Sorgu tamamlandı. Kayıtlı: ${registered.length}, Kayıtsız: ${unregistered.length}`
  );
  setLoading(false);
});

copyPromptBtn.addEventListener("click", async () => {
  if (!promptOutput.value.trim()) {
    setStatus("Önce sorgulama yapın, ardından prompt oluşturulur.");
    return;
  }

  try {
    await navigator.clipboard.writeText(promptOutput.value);
    setStatus("ChatGPT promptu panoya kopyalandı.");
  } catch {
    setStatus("Panoya kopyalama başarısız. Metni manuel kopyalayabilirsiniz.");
  }
});

function sanitizeImeis(raw) {
  return raw
    .split(/\s+/)
    .map((x) => x.trim())
    .filter(Boolean)
    .filter((x, idx, arr) => arr.indexOf(x) === idx)
    .filter((x) => /^\d{15}$/.test(x));
}

async function querySingleImei({ imei, endpoint, apiKey }) {
  if (!endpoint) {
    return mockCheck(imei);
  }

  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}),
      },
      body: JSON.stringify({ imei }),
    });

    if (!response.ok) {
      return {
        imei,
        registered: false,
        reason: `API hatası (${response.status})`,
      };
    }

    const data = await response.json();
    return normalizeApiResponse(imei, data);
  } catch {
    return {
      imei,
      registered: false,
      reason: "Bağlantı hatası veya CORS engeli",
    };
  }
}

function normalizeApiResponse(imei, data) {
  const registered =
    data.registered ?? data.isRegistered ?? data.status === "registered";

  const reason = data.reason || data.message || "Durum bilgisi API tarafından iletilmedi";

  return {
    imei,
    registered: Boolean(registered),
    reason: registered ? "Kayıtlı" : reason,
  };
}

function mockCheck(imei) {
  const lastDigit = Number(imei.slice(-1));

  if (lastDigit % 2 === 0) {
    return Promise.resolve({
      imei,
      registered: true,
      reason: "Kayıtlı",
    });
  }

  const reasons = [
    "Yurt dışı cihaz ve kullanım süresi dolmuş",
    "BTK veri tabanında eşleşme bulunamadı",
    "Klon/şüpheli IMEI statüsü",
  ];

  return Promise.resolve({
    imei,
    registered: false,
    reason: reasons[lastDigit % reasons.length],
  });
}

function renderResults(targetList, items, showReason) {
  if (!items.length) {
    const li = document.createElement("li");
    li.innerHTML = "<span class='reason'>Kayıt yok</span>";
    targetList.append(li);
    return;
  }

  items.forEach((item) => {
    const fragment = resultItemTemplate.content.cloneNode(true);
    fragment.querySelector(".imei").textContent = item.imei;

    const reasonEl = fragment.querySelector(".reason");
    reasonEl.textContent = showReason ? `Sebep: ${item.reason}` : "Durum: Kayıtlı";

    targetList.append(fragment);
  });
}

function buildChatGptPrompt(registered, unregistered) {
  const prompt = [
    "Aşağıdaki IMEI sorgu sonuçlarını analiz et:",
    "",
    "Kayıtlı IMEI'ler:",
    registered.length ? registered.map((x) => `- ${x.imei}`).join("\n") : "- Yok",
    "",
    "Kayıtsız IMEI'ler ve nedenleri:",
    unregistered.length
      ? unregistered.map((x) => `- ${x.imei}: ${x.reason}`).join("\n")
      : "- Yok",
    "",
    "Lütfen kayıtsız IMEI'ler için kısa aksiyon önerileri üret.",
  ].join("\n");

  promptOutput.value = prompt;
}

function clearResults() {
  registeredList.innerHTML = "";
  unregisteredList.innerHTML = "";
  promptOutput.value = "";
  registeredCount.textContent = "0";
  unregisteredCount.textContent = "0";
}

function setLoading(loading) {
  queryBtn.disabled = loading;
  queryBtn.textContent = loading ? "Sorgulanıyor..." : "Toplu Sorgula";
}

function setStatus(message) {
  statusEl.textContent = message;
}
