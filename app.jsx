// ============================================================
//  TacLoRa — app.jsx
// ============================================================

const { useState, useEffect, useRef, useCallback } = React;

// ─── Helpers ─────────────────────────────────────────────────
const rssiColor = r => r > -70 ? "#00ff88" : r > -90 ? "#ffd700" : "#ff4444";
const rssiLabel = r => r > -70 ? "EXCELENTE" : r > -90 ? "BOM" : "FRACO";
const fixColor  = s => s >= 7  ? "#00ff88" : s >= 4   ? "#ffd700" : "#ff4444";
const fixLabel  = s => s >= 7  ? "FIX 3D"  : s >= 4   ? "FIX 2D"  : "SEM FIX";
const now8      = () => new Date().toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });

// Retorna vermelho se for apenas ping, senão a cor baseada no RSSI
const nodeColor = n => (n && n.pingOnly) ? "#ff4444" : rssiColor(n?.rssi ?? -120);

// ─── BLE UUIDs ───────────────────────────────────────────────
const BLE_SERVICE = "6e400001-b5a3-f393-e0a9-e50e24dcca9e";
const BLE_TX_UUID = "6e400003-b5a3-f393-e0a9-e50e24dcca9e";
const BLE_RX_UUID = "6e400002-b5a3-f393-e0a9-e50e24dcca9e";

// ════════════════════════════════════════════════════════════
//  MAP VIEW
// ════════════════════════════════════════════════════════════
function MapView({ nodes, selectedNode, onSelectNode, myPos }) {
  const mapDivRef  = useRef(null);
  const leaflet    = useRef(null);
  const markersRef = useRef({});
  const myMarker   = useRef(null);
  const linesRef   = useRef([]);

  const makeIcon = (color, isMe = false, heading = null) => {
    const r = isMe ? 14 : 10;
    const cx = 24, cy = 24, size = 48;
    let arrow = "";
    if (heading !== null && !isMe) {
      const rad = (heading - 90) * Math.PI / 180;
      const x2  = cx + Math.cos(rad) * 22;
      const y2  = cy + Math.sin(rad) * 22;
      arrow = `<line x1="${cx}" y1="${cy}" x2="${x2}" y2="${y2}"
                     stroke="${color}" stroke-width="2.5" stroke-linecap="round"/>
               <circle cx="${x2}" cy="${y2}" r="3" fill="${color}"/>`;
    }
    const pulse = isMe
      ? `<circle cx="${cx}" cy="${cy}" r="${r+7}" fill="none"
                 stroke="${color}" stroke-width="1" stroke-dasharray="3 3" opacity="0.5"/>`
      : "";
    const svg = `<svg xmlns="http://www.w3.org/2000/svg"
                      width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
                   ${pulse}${arrow}
                   <circle cx="${cx}" cy="${cy}" r="${r}"
                           fill="${color}28" stroke="${color}" stroke-width="2.5"/>
                   <circle cx="${cx}" cy="${cy}" r="4" fill="${color}"/>
                 </svg>`;
    return L.divIcon({
      html: svg, className: "",
      iconSize:    [size, size],
      iconAnchor:  [cx, cy],
      popupAnchor: [0, -(r + 8)],
    });
  };

  const popupHTML = n => `
    <div style="font-family:'Share Tech Mono',monospace;line-height:1.7;font-size:11px">
      <b style="color:${nodeColor(n)};letter-spacing:2px;font-size:13px">NÓ ${n.id.slice(-3)}</b>
      <div style="color:#4a6a5a;font-size:9px;margin-bottom:6px">${n.id}</div>
      <span style="color:#4a6a5a">LAT  </span>${n.lat.toFixed(6)}°<br/>
      <span style="color:#4a6a5a">LON  </span>${n.lon.toFixed(6)}°<br/>
      <span style="color:#4a6a5a">ALT  </span>${n.alt}m
      &nbsp;&nbsp;<span style="color:#4a6a5a">SPD </span>${n.speed}km/h<br/>
      <span style="color:#4a6a5a">HDG  </span>${n.heading}°
      &nbsp;&nbsp;<span style="color:#4a6a5a">SATS </span>${n.sats === 255 ? "FIXO" : n.sats}<br/>
      <span style="color:#4a6a5a">RSSI </span>
        <span style="color:${rssiColor(n.rssi)}">${n.rssi}dBm — ${rssiLabel(n.rssi)}</span><br/>
      <span style="color:#4a6a5a">HOPS </span>${n.hops}
      &nbsp;&nbsp;<span style="color:#4a6a5a">PDOP </span>${n.pdop}<br/>
      <span style="color:#4a6a5a">FIX  </span>
        <span style="color:${fixColor(n.sats)}">${fixLabel(n.sats)}</span>
      
      ${n.dist ? `<div style="text-align:center; color:#00ff88; font-size:10px; margin-top:8px; border-top:1px dashed #00ff8840; padding-top:4px; letter-spacing:1px">DIST: ${n.dist}</div>` : ""}
    </div>`;

  // Init Leaflet once
  useEffect(() => {
    if (leaflet.current || !mapDivRef.current) return;
    const center = myPos ? [myPos.lat, myPos.lon] : [-22.869, -43.136];
    leaflet.current = L.map(mapDivRef.current, {
      center, zoom: 16, zoomControl: true, attributionControl: true,
    });
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: "© OpenStreetMap contributors", maxZoom: 19,
    }).addTo(leaflet.current);
    return () => { leaflet.current?.remove(); leaflet.current = null; };
  }, []);

  // Redraw markers & lines
  useEffect(() => {
    if (!leaflet.current) return;
    const map = leaflet.current;

    linesRef.current.forEach(l => l.remove());
    linesRef.current = [];

    if (myPos) {
      if (myMarker.current) {
        myMarker.current.setLatLng([myPos.lat, myPos.lon]);
      } else {
        myMarker.current = L.marker([myPos.lat, myPos.lon], {
          icon: makeIcon("#00aaff", true), zIndexOffset: 1000,
        }).addTo(map).bindPopup(`
          <div style="font-family:'Share Tech Mono',monospace;font-size:11px">
            <b style="color:#00aaff;letter-spacing:2px">YOU</b><br/>
            ${myPos.lat.toFixed(6)}, ${myPos.lon.toFixed(6)}
          </div>`);
      }
      nodes.forEach(n => {
        if (n.lat === 0 && n.lon === 0) return; // Ignora nós sem coordenada
        linesRef.current.push(
          L.polyline([[myPos.lat, myPos.lon], [n.lat, n.lon]], {
            color: rssiColor(n.rssi), weight: 1.5, opacity: 0.3, dashArray: "5 9",
          }).addTo(map)
        );
      });
    }

    nodes.forEach(n => {
      if (n.lat === 0 && n.lon === 0) return; // Ignora nós sem coordenada
      const icon = makeIcon(nodeColor(n), false, n.speed > 0 ? n.heading : null);
      if (markersRef.current[n.id]) {
        markersRef.current[n.id].setLatLng([n.lat, n.lon]).setIcon(icon).setPopupContent(popupHTML(n));
      } else {
        markersRef.current[n.id] = L.marker([n.lat, n.lon], { icon })
          .addTo(map).bindPopup(popupHTML(n))
          .on("click", () => onSelectNode(n));
      }
    });

    Object.keys(markersRef.current).forEach(id => {
      if (!nodes.find(n => n.id === id)) {
        markersRef.current[id].remove();
        delete markersRef.current[id];
      }
    });
  }, [nodes, myPos]);

  // Pan to selected
  useEffect(() => {
    if (!selectedNode || !leaflet.current || (selectedNode.lat === 0 && selectedNode.lon === 0)) return;
    leaflet.current.setView([selectedNode.lat, selectedNode.lon], 17, { animate: true });
    markersRef.current[selectedNode.id]?.openPopup();
  }, [selectedNode]);

  return <div ref={mapDivRef} style={{ width: "100%", height: "100%" }} />;
}

// ════════════════════════════════════════════════════════════
//  SETPOS FORM
// ════════════════════════════════════════════════════════════
function SetPosForm({ onSend }) {
  const [lat, setLat] = useState("");
  const [lon, setLon] = useState("");
  const [alt, setAlt] = useState("0");
  const field = {
    background: "#0d1a14", border: "1px solid #00ff8830",
    color: "#c8d8c0", padding: "7px 10px", fontSize: 11,
    borderRadius: 2, fontFamily: "inherit", width: "100%",
  };
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 80px", gap: 6 }}>
        {[
          ["LATITUDE",  lat, setLat, "-22.869"],
          ["LONGITUDE", lon, setLon, "-43.136"],
          ["ALT (m)",   alt, setAlt, "0"],
        ].map(([label, val, set, ph]) => (
          <div key={label}>
            <div style={{ fontSize: 8, color: "#4a6a5a", marginBottom: 3 }}>{label}</div>
            <input value={val} onChange={e => set(e.target.value)}
                   placeholder={ph} style={field} />
          </div>
        ))}
      </div>
      <button
        onClick={() => lat && lon && onSend(`setpos ${lat} ${lon} ${alt}`)}
        style={{
          background:  lat && lon ? "#00ff8818" : "transparent",
          border:     `1px solid ${lat && lon ? "#00ff88" : "#00ff8830"}`,
          color:       lat && lon ? "#00ff88" : "#4a6a5a",
          padding: "8px", fontSize: 9, letterSpacing: 2,
          cursor: "pointer", borderRadius: 2, fontFamily: "inherit",
        }}>⊕ DEFINIR POSIÇÃO</button>
    </div>
  );
}

// ════════════════════════════════════════════════════════════
//  FREE COMMAND INPUT
// ════════════════════════════════════════════════════════════
function FreeCmd({ onSend, connected }) {
  const [val, setVal] = useState("");
  const send = () => { if (val.trim()) { onSend(val.trim()); setVal(""); } };
  return (
    <div style={{ display: "flex", gap: 8 }}>
      <input
        value={val}
        onChange={e => setVal(e.target.value)}
        onKeyDown={e => e.key === "Enter" && send()}
        placeholder={connected ? "ex: send 248 teste" : "conecte o BLE primeiro"}
        style={{
          flex: 1, background: "#0d1a14", border: "1px solid #00ff8830",
          color: "#c8d8c0", padding: "8px 10px", fontSize: 11,
          borderRadius: 2, fontFamily: "inherit",
        }}
      />
      <button onClick={send} style={{
        background: val.trim() ? "#00ff8818" : "transparent",
        border:    `1px solid ${val.trim() ? "#00ff88" : "#00ff8830"}`,
        color:      val.trim() ? "#00ff88" : "#4a6a5a",
        padding: "8px 12px", fontSize: 13,
        cursor: "pointer", borderRadius: 2, fontFamily: "inherit",
      }}>▶</button>
    </div>
  );
}

// ════════════════════════════════════════════════════════════
//  ROOT APP
// ════════════════════════════════════════════════════════════
function TacLoRa() {
  const [tab,          setTab]          = useState("map");
  const [nodes,        setNodes]        = useState([]);
  const [messages,     setMessages]     = useState([]);
  const [selectedNode, setSelectedNode] = useState(null);
  const [chatTarget,   setChatTarget]   = useState("ALL");
  const [input,        setInput]        = useState("");
  const [connected,    setConnected]    = useState(false);
  const [bleStatus,    setBleStatus]    = useState("DESCONECTADO");
  const [bleDevice,    setBleDevice]    = useState(null);
  const [myPos,        setMyPos]        = useState({ lat: -22.869036, lon: -43.136280 });
  const [log,          setLog]          = useState([]);

  const bleRxChar  = useRef(null);
  const chatEndRef = useRef(null);
  const logEndRef  = useRef(null);

  useEffect(() => { chatEndRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages]);
  useEffect(() => { logEndRef.current?.scrollIntoView({ behavior: "smooth" }); }, [log]);

  // ── Log collector ─────────────────────────────────────────
  const addLog = useCallback((line) => {
    const ts = new Date().toISOString().slice(11, 19);
    setLog(prev => [...prev.slice(-2000), `[${ts}] ${line}`]);
  }, []);

  const downloadLog = () => {
    if (log.length === 0) return;
    const blob = new Blob([log.join("\n")], { type: "text/plain" });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement("a");
    a.href     = url;
    a.download = `taclora_${new Date().toISOString().slice(0,19).replace(/:/g,"-")}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // ── BLE ───────────────────────────────────────────────────
  const connectBLE = async () => {
    if (!navigator.bluetooth) { setBleStatus("BLE NÃO SUPORTADO"); return; }
    try {
      setBleStatus("CONECTANDO...");
      const device = await navigator.bluetooth.requestDevice({
        filters: [{ namePrefix: "TacLoRa" }],
        optionalServices: [BLE_SERVICE],
      });
      const server  = await device.gatt.connect();
      const service = await server.getPrimaryService(BLE_SERVICE);
      const txChar  = await service.getCharacteristic(BLE_TX_UUID);
      bleRxChar.current = await service.getCharacteristic(BLE_RX_UUID);

      await txChar.startNotifications();
      txChar.addEventListener("characteristicvaluechanged", e => {
        parseIncoming(new TextDecoder().decode(e.target.value));
      });
      device.addEventListener("gattserverdisconnected", () => {
        setConnected(false); setBleStatus("DESCONECTADO");
        setBleDevice(null);  bleRxChar.current = null;
        addLog("BLE desconectado");
      });

      setBleDevice(device);
      setConnected(true);
      setBleStatus(device.name);
      addLog(`BLE conectado: ${device.name}`);
    } catch (err) {
      setBleStatus("ERRO: " + err.message.slice(0, 28));
      setConnected(false);
    }
  };

  const disconnectBLE = () => {
    bleDevice?.gatt?.disconnect();
    setConnected(false); setBleStatus("DESCONECTADO");
    setBleDevice(null);  bleRxChar.current = null;
  };

  const sendBLE = async (cmd) => {
    if (!bleRxChar.current) return;
    try {
      await bleRxChar.current.writeValue(new TextEncoder().encode(cmd + "\n"));
      addLog(`> ${cmd}`);
    } catch (e) { console.error("BLE write:", e); }
  };

  // ── Parse firmware tacLog ─────────────────────────────────
  const parseIncoming = useCallback((raw) => {
    raw.split("\n").forEach(line => {
      line = line.trim();
      if (!line) return;

      addLog(line); // Regista todas as linhas no terminal do app

      // [GPS] 208 RSSI:-65dBm Lat:-22.869036 Lon:-43.136280 ...
      const gpsMatch = line.match(/\[GPS\]\s+([a-fA-F0-9]+)\s+\w+:(-?\d+)dBm\s+Lat:([-\d.]+)\s+Lon:([-\d.]+)\s+Alt:(-?\d+)m\s+Hdg:([\d.]+)°\s+Spd:(\d+)km\/h\s+Sats:(\d+)\s+PDOP:([\d.]+)/i);
      if (gpsMatch) {
        const [, id, rssi, lat, lon, alt, hdg, spd, sats, pdop] = gpsMatch;
        const formattedId = "0x" + id.padStart(8, '0').toUpperCase();
        const distMatch = line.match(/DIST:\s*([\d.]+[a-zA-Z]*)/i);
        const nodeDist = distMatch ? distMatch[1] : null;

        setNodes(prev => {
          const existing = prev.find(n => n.id === formattedId);
          const updated  = {
            id: formattedId,
            lat:      parseFloat(lat),
            lon:      parseFloat(lon),
            alt:      parseInt(alt),
            heading:  parseFloat(hdg),
            speed:    parseInt(spd),
            sats:     parseInt(sats),
            pdop:     parseFloat(pdop),
            rssi:     parseInt(rssi),
            hops:     existing?.hops ?? 0,
            dist:     nodeDist || existing?.dist || null,
            lastSeen: 0,
            pingOnly: false, // Node tem GPS valido, sai do estado "vermelho"
          };
          return existing
            ? prev.map(n => n.id === formattedId ? updated : n)
            : [...prev, updated];
        });
      }

      // [PING] De TacLoRa-208 RSSI:-65dBm Saltos:1
      const pingMatch = line.match(/\[PING\]\s+De\s+TacLoRa-([a-fA-F0-9]+)\s+\w+:(-?\d+)dBm\s+Saltos:(\d+)/i);
      if (pingMatch) {
        const [, id, rssi, hops] = pingMatch;
        const formattedId = "0x" + id.padStart(8, '0').toUpperCase();
        setNodes(prev => {
          const existing = prev.find(n => n.id === formattedId);
          if (existing) {
            // Mantém o status de pingOnly existente (se já tiver GPS será false, senão true)
            return prev.map(n => n.id === formattedId ? { ...n, rssi: parseInt(rssi), hops: parseInt(hops), lastSeen: 0 } : n);
          } else {
            // Cria nó apenas via PING - fica "vermelho" e não aparece no mapa
            return [...prev, {
              id: formattedId,
              lat: 0, lon: 0, alt: 0, heading: 0, speed: 0, sats: 0, pdop: 0,
              dist: null,
              rssi: parseInt(rssi),
              hops: parseInt(hops),
              lastSeen: 0,
              pingOnly: true, // Tag que colore de vermelho
            }];
          }
        });
      }

      // [DATA] MSG de TacLoRa-208 : ola pessoal
      const dataMatch = line.match(/\[DATA\]\s+MSG\s+de\s+TacLoRa-([a-fA-F0-9]+)\s+:\s+(.+)/i);
      if (dataMatch) {
        const [, fromId, text] = dataMatch;
        const formattedFrom = "0x" + fromId.padStart(8, '0').toUpperCase();
        setMessages(prev => [...prev, {
          id: Date.now(), from: formattedFrom, to: "ME", text: text.trim(), time: now8(), ack: false
        }]);
      }

      // [ACK] Acusa recebimento de 0x00000208 MsgId=304 (0 retries)
      const ackMatch = line.match(/\[ACK\]\s+Acusa\s+recebimento\s+de\s+0x([0-9a-fA-F]+)/i);
      if (ackMatch) {
        // Pega apenas a parte hexadecimal, coloca em maiúsculo e adiciona o "0x" minúsculo na frente
        const ackId = "0x" + ackMatch[1].padStart(8, '0').toUpperCase();
        
        setMessages(prev => {
          // Busca de trás para frente a última mensagem que mandamos para esse nó e que ainda não tem ACK
          const reversedIndex = prev.slice().reverse().findIndex(m => m.from === "ME" && m.to === ackId && !m.ack);
          
          if (reversedIndex !== -1) {
            const actualIndex = prev.length - 1 - reversedIndex;
            const newMsgs = [...prev];
            // Atualiza a mensagem com ack: true
            newMsgs[actualIndex] = { ...newMsgs[actualIndex], ack: true };
            return newMsgs;
          }
          return prev;
        });
      }

      // [TX] GPS Enviado: Lat:-22.869036 Lon:-43.136280
      const txMatch = line.match(/\[TX\]\s+GPS\s+Enviado:\s+Lat:([-\d.]+)\s+Lon:([-\d.]+)/i);
      if (txMatch) {
        setMyPos({ lat: parseFloat(txMatch[1]), lon: parseFloat(txMatch[2]) });
      }
    });
  }, [addLog]);

  // ── Send chat ─────────────────────────────────────────────
  const sendMessage = () => {
    const text = input.trim();
    if (!text) return;
    sendBLE(chatTarget === "ALL" ? `broadcast ${text}` : `send ${chatTarget.slice(-3)} ${text}`);
    setMessages(prev => [...prev, { id: Date.now(), from: "ME", to: chatTarget, text, time: now8(), ack: false }]);
    setInput("");
  };

  const filteredMessages = chatTarget === "ALL"
    ? messages
    : messages.filter(m =>
        m.from === chatTarget || m.to === chatTarget ||
        (m.from === "ME" && m.to === chatTarget)
      );

  // ── Shared styles ─────────────────────────────────────────
  const S = {
    btn: (active, color = "#00ff88") => ({
      background:  active ? color + "18" : "transparent",
      border:     `1px solid ${active ? color : color + "30"}`,
      color:       active ? color : "#4a6a5a",
      padding:    "4px 10px", fontSize: 9, letterSpacing: 2,
      cursor:     "pointer", borderRadius: 2, fontFamily: "inherit",
    }),
    label: { color: "#4a6a5a", fontSize: 9, letterSpacing: 1 },
    value: { color: "#c8d8c0", fontSize: 9 },
  };

  // ── Log line color ────────────────────────────────────────
  const logColor = line => {
    if (line.includes("[GPS]"))     return "#00ff88";
    if (line.includes("[DATA]"))    return "#00aaff";
    if (line.includes("[PING]"))    return "#ffd700";
    if (line.includes("[TX]"))      return "#00ff8877";
    if (line.includes("[ACK]"))     return "#aa88ff";
    if (line.includes("[FORWARD]")) return "#c8a060";
    if (line.includes("[RELAY]"))   return "#c8a060";
    if (line.includes("[ERROR]"))   return "#ff4444";
    if (line.includes("[AES]"))     return "#ff4444";
    if (line.includes("> "))        return "#00aaff88"; // sent commands
    if (line.includes("BLE "))      return "#00aaff";
    return "#6a8a6a";
  };

  // ════════════════════════════════════════════════════════
  return (
    <div style={{
      fontFamily:    "'Share Tech Mono','Courier New',monospace",
      background:    "#080c10",
      color:         "#c8d8c0",
      height:        "100vh",
      display:       "flex",
      flexDirection: "column",
      overflow:      "hidden",
      maxWidth:      480,
      margin:        "0 auto",
    }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Share+Tech+Mono&family=Rajdhani:wght@500;700&display=swap');
        * { box-sizing: border-box; margin: 0; padding: 0; }
        ::-webkit-scrollbar { width: 4px; }
        ::-webkit-scrollbar-track { background: #0d1418; }
        ::-webkit-scrollbar-thumb { background: #00ff8844; border-radius: 2px; }
        .leaflet-container       { background: #0d1a14 !important; }
        .leaflet-tile            { filter: invert(1) hue-rotate(180deg) brightness(0.85) saturate(0.6); }
        .leaflet-popup-content-wrapper {
          background: #0a0f14; border: 1px solid #00ff8840;
          color: #c8d8c0; border-radius: 2px; box-shadow: 0 4px 24px #000a;
        }
        .leaflet-popup-tip           { background: #0a0f14; }
        .leaflet-popup-close-button  { color: #00ff88 !important; font-size: 16px !important; }
        .leaflet-control-zoom a      { background: #0a0f14 !important; color: #00ff88 !important; border-color: #00ff8830 !important; }
        .leaflet-control-attribution { background: #080c10cc !important; color: #4a6a5a !important; font-size: 8px !important; }
        @keyframes fadeIn { from{opacity:0;transform:translateY(4px)} to{opacity:1;transform:translateY(0)} }
        @keyframes blink  { 0%,100%{opacity:1} 50%{opacity:0.3} }
        input:focus { outline: none; border-color: #00ff8880 !important; }
      `}</style>

      {/* ── HEADER ───────────────────────────────────────── */}
      <div style={{
        padding: "10px 14px 8px", borderBottom: "1px solid #00ff8820",
        background: "#0a0f14", display: "flex", alignItems: "center", justifyContent: "space-between",
      }}>
        <div>
          <div style={{ display: "flex", alignItems: "center", fontSize: 15, color: "#ffffff", letterSpacing: 4, fontFamily: "Rajdhani,sans-serif", fontWeight: 700 }}>
            <img src="SAETE_LOGO.png" alt="SAETE Logo" style={{ height: "18px", marginRight: "8px" }} />
            SPECTRA
          </div>
          <div style={{ fontSize: 8, color: "#ffffff", letterSpacing: 3, marginTop: "2px" }}>C2 - MÓDULO LoRa</div>
        </div>
        <div style={{ textAlign: "right" }}>
          <button onClick={connected ? disconnectBLE : connectBLE} style={S.btn(connected)}>
            {connected ? "● ONLINE" : "○ CONECTAR"}
          </button>
          <div style={{
            fontSize: 8, color: "#4a6a5a", marginTop: 3, letterSpacing: 1,
            animation: connected ? "none" : "blink 2s infinite",
          }}>{bleStatus}</div>
        </div>
      </div>

      {/* ── NODE STRIP ───────────────────────────────────── */}
      <div style={{
        display: "flex", gap: 6, padding: "6px 14px", overflowX: "auto",
        borderBottom: "1px solid #00ff8812", background: "#090d12", scrollbarWidth: "none",
      }}>
        {nodes.map(n => (
          <div key={n.id}
            onClick={() => { setSelectedNode(n); setTab("map"); }}
            style={{
              flex: "0 0 auto", cursor: "pointer", minWidth: 72,
              border:     `1px solid ${nodeColor(n)}${selectedNode?.id === n.id ? "cc" : "44"}`,
              background:  selectedNode?.id === n.id ? nodeColor(n) + "14" : "transparent",
              padding: "4px 8px", borderRadius: 2, animation: "fadeIn 0.3s ease",
            }}>
            <div style={{ fontSize: 9, color: nodeColor(n), letterSpacing: 1 }}>
              {n.hops === 0 ? "◉" : "◎"} {n.id.slice(-3)}
            </div>
            <div style={{ fontSize: 8, color: "#4a6a5a" }}>{n.rssi}dBm</div>
            <div style={{ fontSize: 8, color: n.pingOnly ? "#ff4444" : fixColor(n.sats) }}>
              {n.pingOnly ? "S/ GPS" : fixLabel(n.sats)}
            </div>
          </div>
        ))}
        {nodes.length === 0 && (
          <div style={{ fontSize: 9, color: "#4a6a5a", padding: "4px 0", animation: "blink 2s infinite" }}>
            aguardando nós...
          </div>
        )}
      </div>

      {/* ── TAB BAR ──────────────────────────────────────── */}
      <div style={{ display: "flex", borderBottom: "1px solid #00ff8820", background: "#0a0f14" }}>
        {[["map","◈ MAPA"],["chat","▦ CHAT"],["nodes","◎ NÓS"],["cmd","⌘ CMD"],["log","📋 LOG"]].map(([key, label]) => (
          <button key={key} onClick={() => setTab(key)} style={{
            flex: 1, padding: "8px 2px", fontSize: 8, letterSpacing: 1,
            background:   tab === key ? "#00ff8810" : "transparent",
            color:        tab === key ? "#00ff88"   : "#4a6a5a",
            border:       "none",
            borderBottom: tab === key ? "2px solid #00ff88" : "2px solid transparent",
            cursor: "pointer", fontFamily: "inherit", transition: "all 0.15s",
          }}>{label}</button>
        ))}
      </div>

      {/* ── CONTENT ──────────────────────────────────────── */}
      <div style={{ flex: 1, overflow: "hidden", position: "relative" }}>

        {/* ══ MAP ════════════════════════════════════════════ */}
        {tab === "map" && (
          <div style={{ height: "100%", display: "flex", flexDirection: "column" }}>
            <div style={{ flex: 1, overflow: "hidden" }}>
              <MapView nodes={nodes} selectedNode={selectedNode}
                       onSelectNode={setSelectedNode} myPos={myPos} />
            </div>
            {selectedNode && selectedNode.lat !== 0 && selectedNode.lon !== 0 && (
              <div style={{
                padding: "10px 14px", borderTop: "1px solid #00ff8820",
                background: "#0a0f14", animation: "fadeIn 0.2s ease",
              }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                  <div style={{ flex: 1 }}>
                    <div style={{
                      fontSize: 13, color: nodeColor(selectedNode),
                      fontFamily: "Rajdhani,sans-serif", fontWeight: 700, letterSpacing: 2,
                    }}>NÓ {selectedNode.id.slice(-3)}</div>
                    <div style={{ fontSize: 8, color: "#4a6a5a", marginBottom: 6 }}>{selectedNode.id}</div>
                    
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "3px 12px" }}>
                      {[
                        ["LAT",  selectedNode.lat.toFixed(6) + "°"],
                        ["LON",  selectedNode.lon.toFixed(6) + "°"],
                        ["ALT",  selectedNode.alt + "m"],
                        ["SPD",  selectedNode.speed + "km/h"],
                        ["HDG",  selectedNode.heading + "°"],
                        ["RSSI", selectedNode.rssi + "dBm"],
                        ["SATS", selectedNode.sats === 255 ? "FIXO" : selectedNode.sats],
                        ["PDOP", selectedNode.pdop],
                        ["HOPS", selectedNode.hops],
                      ].map(([k, v]) => (
                        <div key={k}>
                          <div style={S.label}>{k}</div>
                          <div style={S.value}>{v}</div>
                        </div>
                      ))}
                    </div>

                    <div style={{ display: "flex", alignItems: "center", margin: "10px 0 0" }}>
                      <div style={{ flex: 1, borderBottom: "1px dashed #00ff8840" }}></div>
                      {selectedNode.dist && (
                        <div style={{ fontSize: 10, color: "#00ff88", padding: "0 10px", letterSpacing: 1 }}>
                          DIST: {selectedNode.dist}
                        </div>
                      )}
                      <div style={{ flex: 1, borderBottom: "1px dashed #00ff8840" }}></div>
                    </div>

                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 5, marginLeft: 10 }}>
                    <button onClick={() => { setChatTarget(selectedNode.id); setTab("chat"); }}
                            style={S.btn(true)}>▦ CHAT</button>
                    <button onClick={() => setSelectedNode(null)}
                            style={S.btn(false)}>✕ FECHAR</button>
                  </div>
                </div>
              </div>
            )}
            {selectedNode && selectedNode.pingOnly && (
              <div style={{ padding: "10px", background: "#0a0f14", color: "#ff4444", textAlign: "center", fontSize: 10 }}>
                NÓ {selectedNode.id.slice(-3)} APENAS PING (SEM COORDENADAS PARA EXIBIR NO MAPA)
              </div>
            )}
          </div>
        )}

        {/* ══ CHAT ═══════════════════════════════════════════ */}
        {tab === "chat" && (
          <div style={{ height: "100%", display: "flex", flexDirection: "column" }}>
            <div style={{
              display: "flex", gap: 6, padding: "8px 14px", overflowX: "auto",
              borderBottom: "1px solid #00ff8812", background: "#090d12", scrollbarWidth: "none",
            }}>
              {["ALL", ...nodes.map(n => n.id)].map(id => (
                <button key={id} onClick={() => setChatTarget(id)} style={{
                  ...S.btn(chatTarget === id), flex: "0 0 auto", padding: "3px 9px",
                }}>
                  {id === "ALL" ? "◈ TODOS" : id.slice(-3)}
                </button>
              ))}
            </div>

            <div style={{
              flex: 1, overflowY: "auto", padding: "12px 14px",
              display: "flex", flexDirection: "column", gap: 10,
            }}>
              {filteredMessages.length === 0 && (
                <div style={{ color: "#4a6a5a", fontSize: 10, textAlign: "center", marginTop: 40 }}>
                  sem mensagens
                </div>
              )}
              {filteredMessages.map(msg => {
                const isMe   = msg.from === "ME";
                const nColor = isMe ? "#00ff88" : nodeColor(nodes.find(n => n.id === msg.from));
                return (
                  <div key={msg.id} style={{
                    display: "flex", flexDirection: isMe ? "row-reverse" : "row",
                    gap: 8, animation: "fadeIn 0.2s ease",
                  }}>
                    {!isMe && (
                      <div style={{
                        width: 30, height: 30, borderRadius: "50%", flexShrink: 0,
                        background: nColor + "18", border: `1px solid ${nColor}44`,
                        display: "flex", alignItems: "center", justifyContent: "center",
                        fontSize: 8, color: nColor,
                      }}>{msg.from.slice(-3)}</div>
                    )}
                    <div style={{ maxWidth: "72%" }}>
                      {!isMe && (
                        <div style={{ fontSize: 8, color: "#4a6a5a", marginBottom: 2, letterSpacing: 1 }}>
                          {msg.from}
                        </div>
                      )}
                      <div style={{
                        padding: "7px 11px", fontSize: 11, lineHeight: 1.5, color: "#c8d8c0",
                        background:   isMe ? "#00ff8812" : "#0d1a14",
                        border:      `1px solid ${isMe ? "#00ff8830" : "#1a2a1a"}`,
                        borderRadius: isMe ? "8px 2px 8px 8px" : "2px 8px 8px 8px",
                      }}>{msg.text}</div>
                      
                      {/* Área da Hora + Destino + Checkmark (ACK) */}
                      <div style={{
                        fontSize: 8, color: "#4a6a5a", marginTop: 2, letterSpacing: 1,
                        textAlign: isMe ? "right" : "left", display: "flex", alignItems: "center", justifyContent: isMe ? "flex-end" : "flex-start"
                      }}>
                        {msg.time}
                        {msg.to !== "ALL" && ` → ${msg.to === "ME" ? "EU" : msg.to.slice(-3)}`}
                        {/* Se a mensagem for "Minha", exibe se o destino confirmou */}
                        {isMe && msg.to !== "ALL" && (
                          <span style={{ color: msg.ack ? "#00ff88" : "#4a6a5a", marginLeft: 6, fontWeight: msg.ack ? "bold" : "normal" }}>
                            {msg.ack ? "✓✓" : "✓"}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
              <div ref={chatEndRef} />
            </div>

            <div style={{
              padding: "8px 14px", borderTop: "1px solid #00ff8820",
              background: "#0a0f14", display: "flex", gap: 8, alignItems: "center",
            }}>
              <div style={{ fontSize: 9, color: "#4a6a5a", flexShrink: 0 }}>
                → {chatTarget === "ALL" ? "TODOS" : chatTarget.slice(-3)}
              </div>
              <input
                value={input}
                onChange={e => setInput(e.target.value)}
                onKeyDown={e => e.key === "Enter" && sendMessage()}
                placeholder="mensagem..."
                style={{
                  flex: 1, background: "#0d1a14", border: "1px solid #00ff8830",
                  color: "#c8d8c0", padding: "8px 10px", fontSize: 11,
                  borderRadius: 2, fontFamily: "inherit",
                }}
              />
              <button onClick={sendMessage} style={{
                ...S.btn(!!input.trim()), padding: "8px 14px", fontSize: 13,
              }}>▶</button>
            </div>
          </div>
        )}

        {/* ══ NODES ══════════════════════════════════════════ */}
        {tab === "nodes" && (
          <div style={{
            height: "100%", overflowY: "auto", padding: "10px 14px",
            display: "flex", flexDirection: "column", gap: 8,
          }}>
            {nodes.length === 0 && (
              <div style={{ color: "#4a6a5a", fontSize: 10, textAlign: "center", marginTop: 60 }}>
                nenhum nó detectado
              </div>
            )}
            {nodes.map(n => (
              <div key={n.id} style={{
                border: "1px solid #00ff8820", borderLeft: `3px solid ${nodeColor(n)}`,
                background: "#0a0f14", borderRadius: 2, padding: "10px 12px",
                animation: "fadeIn 0.3s ease",
              }}>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
                  <div>
                    <div style={{
                      fontSize: 13, color: nodeColor(n),
                      fontFamily: "Rajdhani,sans-serif", fontWeight: 700, letterSpacing: 2,
                    }}>NÓ {n.id.slice(-3)}</div>
                    <div style={{ fontSize: 8, color: "#4a6a5a" }}>{n.id}</div>
                  </div>
                  <div style={{ textAlign: "right" }}>
                    <div style={{ fontSize: 9, color: rssiColor(n.rssi) }}>{rssiLabel(n.rssi)}</div>
                    <div style={{ fontSize: 8, color: "#4a6a5a" }}>{n.hops === 0 ? "DIRETO" : `${n.hops} HOP`}</div>
                    <div style={{ fontSize: 8, color: "#4a6a5a" }}>{n.lastSeen}s atrás</div>
                  </div>
                </div>
                
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "5px 8px" }}>
                  {[
                    ["RSSI", n.rssi + "dBm",                   rssiColor(n.rssi)],
                    ["SATS", n.sats === 255 ? "FIXO" : n.sats, n.pingOnly ? "#ff4444" : fixColor(n.sats)],
                    ["PDOP", n.pdop,                            "#c8d8c0"],
                    ["LAT",  n.pingOnly ? "---" : n.lat.toFixed(5) + "°", "#c8d8c0"],
                    ["LON",  n.pingOnly ? "---" : n.lon.toFixed(5) + "°", "#c8d8c0"],
                    ["ALT",  n.pingOnly ? "---" : n.alt + "m",            "#c8d8c0"],
                    ["SPD",  n.pingOnly ? "---" : n.speed + "km/h",       "#c8d8c0"],
                    ["HDG",  n.pingOnly ? "---" : n.heading + "°",        "#c8d8c0"],
                    ["FIX",  n.pingOnly ? "P/ GPS" : fixLabel(n.sats),    n.pingOnly ? "#ff4444" : fixColor(n.sats)],
                  ].map(([k, v, c]) => (
                    <div key={k}>
                      <div style={S.label}>{k}</div>
                      <div style={{ ...S.value, color: c }}>{v}</div>
                    </div>
                  ))}
                </div>

                <div style={{ display: "flex", alignItems: "center", margin: "10px 0" }}>
                  <div style={{ flex: 1, borderBottom: "1px dashed #00ff8840" }}></div>
                  {n.dist && (
                    <div style={{ fontSize: 10, color: "#00ff88", padding: "0 10px", letterSpacing: 1 }}>
                      DIST: {n.dist}
                    </div>
                  )}
                  <div style={{ flex: 1, borderBottom: "1px dashed #00ff8840" }}></div>
                </div>

                <div style={{ display: "flex", gap: 6 }}>
                  <button onClick={() => { setSelectedNode(n); setTab("map"); }}
                          style={{ ...S.btn(false), flex: 1, padding: "5px", opacity: n.pingOnly ? 0.3 : 1 }}
                          disabled={n.pingOnly}>◈ MAPA</button>
                  <button onClick={() => { setChatTarget(n.id); setTab("chat"); }}
                          style={{ ...S.btn(false), flex: 1, padding: "5px" }}>▦ CHAT</button>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* ══ CMD ════════════════════════════════════════════ */}
        {tab === "cmd" && (
          <div style={{
            height: "100%", overflowY: "auto", padding: "10px 14px",
            display: "flex", flexDirection: "column", gap: 6,
          }}>
            <div style={{ fontSize: 9, color: "#4a6a5a", letterSpacing: 2, marginBottom: 4 }}>
              COMANDOS RÁPIDOS
            </div>
            {[
              ["status",    "◎ STATUS"],
              ["neighbors", "◎ VIZINHOS"],
              ["help",      "? AJUDA"],
              ["calibrate", "⊕ CALIBRAR BÚSSOLA"],
              ["clearpos",  "✕ LIMPAR POSIÇÃO"],
            ].map(([cmd, label]) => (
              <button key={cmd} onClick={() => sendBLE(cmd)} style={{
                ...S.btn(false), textAlign: "left", padding: "10px 12px",
                fontSize: 10, letterSpacing: 1, width: "100%",
              }}>{label}</button>
            ))}
            <div style={{ borderTop: "1px solid #00ff8820", margin: "6px 0" }} />
            <div style={{ fontSize: 9, color: "#4a6a5a", letterSpacing: 2, marginBottom: 4 }}>
              POSIÇÃO MANUAL
            </div>
            <SetPosForm onSend={sendBLE} />
            <div style={{ borderTop: "1px solid #00ff8820", margin: "6px 0" }} />
            <div style={{ fontSize: 9, color: "#4a6a5a", letterSpacing: 2, marginBottom: 4 }}>
              COMANDO LIVRE
            </div>
            <FreeCmd onSend={sendBLE} connected={connected} />
          </div>
        )}

        {/* ══ LOG ════════════════════════════════════════════ */}
        {tab === "log" && (
          <div style={{ height: "100%", display: "flex", flexDirection: "column" }}>

            {/* Toolbar */}
            <div style={{
              display: "flex", gap: 8, padding: "8px 14px", alignItems: "center",
              borderBottom: "1px solid #00ff8812", background: "#090d12",
            }}>
              <div style={{ fontSize: 9, color: "#4a6a5a", flex: 1, letterSpacing: 1 }}>
                {log.length} LINHAS
              </div>
              <button onClick={downloadLog} style={S.btn(log.length > 0)}>
                ⬇ SALVAR .TXT
              </button>
              <button onClick={() => setLog([])} style={S.btn(false, "#ff4444")}>
                ✕ LIMPAR
              </button>
            </div>

            {/* Lines */}
            <div style={{
              flex: 1, overflowY: "auto", padding: "8px 14px",
              fontFamily: "'Share Tech Mono',monospace", fontSize: 9, lineHeight: 1.6,
            }}>
              {log.length === 0 && (
                <div style={{ color: "#4a6a5a", marginTop: 40, textAlign: "center" }}>
                  sem dados — conecte o BLE
                </div>
              )}
              {log.map((line, i) => (
                <div key={i} style={{
                  color: logColor(line),
                  borderBottom: "1px solid #ffffff05",
                  padding: "1px 0",
                  wordBreak: "break-all",
                }}>{line}</div>
              ))}
              <div ref={logEndRef} />
            </div>
          </div>
        )}

      </div>
    </div>
  );
}

// ── Mount ─────────────────────────────────────────────────────
const root = ReactDOM.createRoot(document.getElementById("root"));
root.render(<TacLoRa />);
