"use client";

import { useState, useEffect, useRef } from "react";
import html2canvas from "html2canvas";
import { jsPDF } from "jspdf";
import { invHTML } from "../lib/invoiceHTML";
import "./globals.css"; // Ensure global CSS has the original styles
import { useSpeechRecognition } from "./hooks/useSpeechRecognition";
import ConversationalDrawer from "./components/ConversationalDrawer";

type Row = { p: string; h: string; q: string; r: string; a: number };
type BillType = 'gst' | 'quotation' | 'cash';

function fallbackParseInput(transcript: string, state: string, language: string): any {
  const t = transcript.toLowerCase().trim();
  let value: any = null;
  let intent: "NEXT" | "PREVIOUS" | "REPEAT" | "CORRECT" | "COMMAND" = "NEXT";
  let command: any = null;
  let corrections: any = {};
  let teFeedback = "";

  if (t.includes("వెనక్కి") || t.includes("previous") || t.includes("go back") || t.includes("back")) {
    return { intent: "PREVIOUS", value: null, command: null, corrections: {}, teFeedback: "వెనక్కి వెళ్తున్నాము" };
  }
  if (t.includes("ఏమన్నావు") || t.includes("repeat") || t.includes("మళ్ళీ")) {
    return { intent: "REPEAT", value: null, command: null, corrections: {}, teFeedback: "మళ్ళీ చెప్తాను" };
  }
  if (t === "undo" || t.includes("రద్దు చేయి") || t.includes("undo last change") || t.includes("undo last action")) {
    return { intent: "COMMAND", value: null, command: { type: "UNDO", data: {} }, corrections: {}, teFeedback: "చివరి మార్పును రద్దు చేసాను" };
  }
  if (t === "redo" || t.includes("మళ్లీ చేయి") || t.includes("redo last action")) {
    return { intent: "COMMAND", value: null, command: { type: "REDO", data: {} }, corrections: {}, teFeedback: "రద్దు చేసిన మార్పును మళ్లీ చేసాను" };
  }
  if (t.includes("apply gst") || t.includes("gst add chey") || t.includes("జీఎస్టీ వర్తింపజేయి")) {
    return { intent: "COMMAND", value: null, command: { type: "APPLY_GST", data: {} }, corrections: {}, teFeedback: "GST వర్తింపజేసాము" };
  }
  if (t.includes("remove gst") || t.includes("gst teesei") || t.includes("జీఎస్టీ తీసివేయి")) {
    return { intent: "COMMAND", value: null, command: { type: "REMOVE_GST", data: {} }, corrections: {}, teFeedback: "GST తీసివేసాము" };
  }
  if (t.includes("download invoice") || t.includes("generate pdf") || t.includes("పిడిఎఫ్ డౌన్‌లోడ్ చేయి")) {
    return { intent: "COMMAND", value: null, command: { type: "GENERATE_PDF", data: {} }, corrections: {}, teFeedback: "పిడిఎఫ్ డౌన్‌లోడ్ అవుతోంది" };
  }
  if (t.includes("start new") || t.includes("కొత్త బిల్లు")) {
    return { intent: "COMMAND", value: null, command: { type: "START_NEW", data: {} }, corrections: {}, teFeedback: "కొత్త బిల్లు ప్రారంభించాము" };
  }
  if (t.includes("cancel invoice") || t.includes("క్యాన్సిల్ చేయి")) {
    return { intent: "COMMAND", value: null, command: { type: "CANCEL", data: {} }, corrections: {}, teFeedback: "బిల్లు క్యాన్సిల్ చేసాము" };
  }

  // Matches "add [qty] [particulars] at [rate]" or "[qty] [particulars] at [rate]"
  const addMatch = t.match(/(?:add\s+)?(\d+)\s+([a-zA-Z0-9\s]+?)\s+(?:at|rate|ధర)\s+(\d+)/i);
  if (addMatch) {
    const qty = addMatch[1];
    const item = addMatch[2].trim();
    const rate = addMatch[3];
    return {
      intent: "COMMAND",
      value: null,
      command: {
        type: "ADD_ITEM",
        data: { p: item, q: qty, r: rate, u: "Nos" }
      },
      corrections: {},
      teFeedback: `${qty} ${item} యాడ్ చేసాను`
    };
  }

  // Matches "remove [particulars]" or "delete [particulars]"
  const removeMatch = t.match(/(?:remove|delete|తీసేయి)\s+([a-zA-Z0-9\s]+)/i);
  if (removeMatch) {
    const item = removeMatch[1].trim();
    return {
      intent: "COMMAND",
      value: null,
      command: {
        type: "REMOVE_ITEM",
        data: { p: item }
      },
      corrections: {},
      teFeedback: `${item} తీసివేసాను`
    };
  }

  // Matches "change [particulars] quantity to [qty]" or "change quantity to [qty]"
  const qtyMatch = t.match(/(?:change\s+)?(?:([a-zA-Z0-9\s]+?)\s+)?(?:quantity|qty)\s+(?:to\s+)?(\d+)/i);
  if (qtyMatch) {
    const item = qtyMatch[1] ? qtyMatch[1].trim() : "";
    const qty = qtyMatch[2];
    return {
      intent: "COMMAND",
      value: null,
      command: {
        type: "CHANGE_QUANTITY",
        data: { p: item, q: qty }
      },
      corrections: {},
      teFeedback: `క్వాంటిటీని ${qty} కి మార్చాము`
    };
  }

  // Matches "change [particulars] rate to [rate]" or "change rate to [rate]"
  const rateMatch = t.match(/(?:change\s+)?(?:([a-zA-Z0-9\s]+?)\s+)?(?:rate|price|ధర)\s+(?:to\s+)?(\d+)/i);
  if (rateMatch) {
    const item = rateMatch[1] ? rateMatch[1].trim() : "";
    const rate = rateMatch[2];
    return {
      intent: "COMMAND",
      value: null,
      command: {
        type: "CHANGE_RATE",
        data: { p: item, r: rate }
      },
      corrections: {},
      teFeedback: `ధరను ${rate} కి మార్చాము`
    };
  }

  switch (state) {
    case "COLLECTING_DOC_TYPE": {
      if (t.includes("gst") || t.includes("జీఎస్టీ") || t.includes("టాక్స్")) {
        value = "gst";
        teFeedback = "GST బిల్ సెలెక్ట్ చేసారు";
      } else if (t.includes("quotation") || t.includes("కొటేషన్") || t.includes("estimate")) {
        value = "quotation";
        teFeedback = "కొటేషన్ సెలెక్ట్ చేసారు";
      } else if (t.includes("cash") || t.includes("క్యాష్") || t.includes("మెమో")) {
        value = "cash";
        teFeedback = "క్యాష్ మెమో సెలెక్ట్ చేసారు";
      } else {
        value = "gst";
        teFeedback = "GST బిల్ సెలెక్ట్ చేసారు";
      }
      break;
    }
    case "COLLECTING_CUSTOMER_NAME": {
      value = transcript.trim();
      teFeedback = `కస్టమర్ పేరు: ${value}`;
      break;
    }
    case "COLLECTING_CUSTOMER_ADDR": {
      if (t.includes("skip") || t.includes("దాటవేయి") || t.includes("వద్దు") || t === "వద్దు") {
        value = "skip";
        teFeedback = "అడ్రస్ దాటవేసాము";
      } else {
        value = transcript.trim();
        teFeedback = `అడ్రస్: ${value}`;
      }
      break;
    }
    case "COLLECTING_ITEM_NAME": {
      if (t.includes("finish") || t.includes("అయిపోయింది") || t.includes("అంతే") || t.includes("చాలు") || t === "అయిపోయింది") {
        value = "finish";
        teFeedback = "ఐటమ్స్ లిస్ట్ పూర్తి చేసాము";
      } else {
        value = transcript.trim();
        teFeedback = `ఐటమ్ పేరు: ${value}`;
      }
      break;
    }
    case "COLLECTING_ITEM_QTY": {
      const teluguQtyMap: Record<string, string> = {
        "ఒకటి": "1", "ఒక": "1", "రెండు": "2", "మూడు": "3", "నాలుగు": "4",
        "ఐదు": "5", "ఆరు": "6", "ఏడు": "7", "ఎనిమిది": "8", "తొమ్మిది": "9",
        "పది": "10", "ఇరవై": "20", "ముప్పై": "30", "నలభై": "40", "యాభై": "50"
      };

      let matchedQty = "";
      Object.keys(teluguQtyMap).forEach(k => {
        if (t.includes(k)) matchedQty = teluguQtyMap[k];
      });

      if (!matchedQty) {
        const numMatch = t.match(/\d+/);
        matchedQty = numMatch ? numMatch[0] : "1";
      }

      value = matchedQty;
      teFeedback = `క్వాంటిటీ: ${value}`;
      break;
    }
    case "COLLECTING_ITEM_RATE": {
      const teluguRateMap: Record<string, number> = {
        "ఒకటి": 1, "రెండు": 2, "మూడు": 3, "నాలుగు": 4, "ఐదు": 5,
        "ఆరు": 6, "ఏడు": 7, "ఎనిమిది": 8, "తొమ్మిది": 9, "పది": 10
      };

      let baseVal = 0;
      let multiplier = 1;

      if (t.includes("వేలు") || t.includes("వేల") || t.includes("వెయ్యి")) {
        multiplier = 1000;
      } else if (t.includes("వందలు") || t.includes("వందల") || t.includes("వంద")) {
        multiplier = 100;
      }

      Object.keys(teluguRateMap).forEach(k => {
        if (t.includes(k)) baseVal = teluguRateMap[k];
      });

      let rateStr = "";
      if (baseVal > 0) {
        rateStr = String(baseVal * multiplier);
      } else {
        const numMatch = t.match(/\d+/g);
        if (numMatch) {
          rateStr = numMatch.join("");
        } else {
          rateStr = "100";
        }
      }

      value = rateStr;
      teFeedback = `ధర: Rs. ${parseFloat(value).toLocaleString("en-IN")}`;
      break;
    }
    case "CONFIRMING_TAX": {
      if (t.includes("yes") || t.includes("అవును") || t.includes("ఆడ్") || t.includes("చేయి")) {
        value = true;
        teFeedback = "GST వర్తింపజేసాము";
      } else {
        value = false;
        teFeedback = "GST తీసివేసాము";
      }
      break;
    }
    case "SUMMARY_REVIEW": {
      if (t.includes("yes") || t.includes("అవును") || t.includes("కన్ఫర్మ్") || t.includes("డౌన్లోడ్")) {
        value = "yes";
        teFeedback = "పిడిఎఫ్ డౌన్‌లోడ్ అవుతోంది";
      } else {
        value = "cancel";
        teFeedback = "బిల్లు క్యాన్సిల్ చేసాము";
      }
      break;
    }
    default:
      value = transcript;
      break;
  }

  return {
    value,
    intent,
    command,
    corrections,
    teFeedback
  };
}

function transliterateTeluguToEnglish(text: string): string {
  const consonants: Record<string, string> = {
    'క': 'k', 'ఖ': 'kh', 'గ': 'g', 'ఘ': 'gh', 'ఙ': 'gn',
    'చ': 'ch', 'ఛ': 'chh', 'జ': 'j', 'ఝ': 'jh', 'ఞ': 'ny',
    'ట': 't', 'ఠ': 'th', 'డ': 'd', 'ఢ': 'dh', 'ణ': 'n',
    'త': 'th', 'థ': 'th', 'ద': 'd', 'ధ': 'dh', 'న': 'n',
    'ప': 'p', 'ఫ': 'ph', 'బ': 'b', 'భ': 'bh', 'మ': 'm',
    'య': 'y', 'ర': 'r', 'ల': 'l', 'వ': 'v', 'శ': 'sh', 'ష': 'sh',
    'స': 's', 'హ': 'h', 'ళ': 'l', 'క్ష': 'ksh', 'ఱ': 'r'
  };

  const independentVowels: Record<string, string> = {
    'అ': 'a', 'ఆ': 'a', 'ఇ': 'i', 'ఈ': 'ee', 'ఉ': 'u', 'ఊ': 'oo', 'ఋ': 'ru',
    'ఎ': 'e', 'ఏ': 'e', 'ఐ': 'ai', 'ఒ': 'o', 'ఓ': 'o', 'ఔ': 'au'
  };

  const vowelSigns: Record<string, string> = {
    'ా': 'a', 'ి': 'i', 'ీ': 'ee', 'ు': 'u', 'ూ': 'oo', 'ృ': 'ru',
    'ె': 'e', 'ే': 'e', 'ై': 'ai', 'ొ': 'o', 'ో': 'o', 'ౌ': 'au',
    'ం': 'm', 'ః': 'h'
  };

  let result = "";
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    
    if (consonants[char] !== undefined) {
      let sound = consonants[char];
      const nextChar = text[i + 1];
      if (nextChar === '్') {
        result += sound;
        i++; // skip halant
      } else if (vowelSigns[nextChar] !== undefined) {
        result += sound + vowelSigns[nextChar];
        i++; // skip vowel sign
      } else {
        result += sound + 'a';
      }
    } else if (independentVowels[char] !== undefined) {
      result += independentVowels[char];
    } else if (vowelSigns[char] !== undefined) {
      result += vowelSigns[char];
    } else {
      result += char;
    }
  }
  
  return result
    .replace(/\s+/g, ' ')
    .replace(/\b\w/g, c => c.toUpperCase())
    .trim();
}

function getLevenshteinDistance(a: string, b: string): number {
  const tmp = [];
  for (let i = 0; i <= a.length; i++) {
    tmp[i] = [i];
  }
  for (let j = 0; j <= b.length; j++) {
    tmp[0][j] = j;
  }
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      tmp[i][j] = Math.min(
        tmp[i - 1][j] + 1,
        tmp[i][j - 1] + 1,
        tmp[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)
      );
    }
  }
  return tmp[a.length][b.length];
}

function autocorrectElectricalTerminology(text: string): string {
  if (!text) return text;

  // 1. Phrase replacement (case-insensitive) before individual word mapping
  // This collapses multi-word spoken numbers like "van payimt phaiv" -> "1.5"
  let processedText = text;
  const phraseMap: { pattern: RegExp; replacement: string }[] = [
    // 1.5 variants
    { pattern: /\b(?:van|one|wan)\s+(?:payimt|payint|point|poiynt)\s+(?:phaiv|phive|five)\b/gi, replacement: "1.5" },
    { pattern: /\b(?:van|one|wan)\s+(?:payimt|payint|point|poiynt)\b/gi, replacement: "1.5" },
    
    // 2.5 variants
    { pattern: /\b(?:tu|too|two)\s+(?:payimt|payint|point|poiynt)\s+(?:phaiv|phive|five)\b/gi, replacement: "2.5" },
    { pattern: /\b(?:tu|too|two)\s+(?:payimt|payint|point|poiynt)\b/gi, replacement: "2.5" },

    // 3.5 variants
    { pattern: /\b(?:tri|three)\s+(?:payimt|payint|point|poiynt)\s+(?:phaiv|phive|five)\b/gi, replacement: "3.5" },
    { pattern: /\b(?:tri|three)\s+(?:payimt|payint|point|poiynt)\b/gi, replacement: "3" },

    // 4.5 and other decimals
    { pattern: /\b(?:fore|four)\s+(?:payimt|payint|point|poiynt)\s+(?:phaiv|phive|five)\b/gi, replacement: "4.5" },
    { pattern: /\b(?:fore|four)\s+(?:payimt|payint|point|poiynt)\b/gi, replacement: "4" },
    { pattern: /\b(?:phaiv|phive|five)\s+(?:payimt|payint|point|poiynt)\s+(?:phaiv|phive|five)\b/gi, replacement: "5.5" },
    { pattern: /\b(?:phaiv|phive|five)\s+(?:payimt|payint|point|poiynt)\b/gi, replacement: "5" },
    { pattern: /\b(?:seks|siks|six)\s+(?:payimt|payint|point|poiynt)\b/gi, replacement: "6" },
    { pattern: /\b(?:sevn|seven)\s+(?:payimt|payint|point|poiynt)\b/gi, replacement: "7" },
    { pattern: /\b(?:eyt|eight)\s+(?:payimt|payint|point|poiynt)\b/gi, replacement: "8" },
    { pattern: /\b(?:nayn|nine)\s+(?:payimt|payint|point|poiynt)\b/gi, replacement: "9" },
    
    // Brand or product specific phrases
    { pattern: /\b(?:h\s*\.?\s*p\b)/gi, replacement: "HP" },
    { pattern: /\bsq\s*(?:mm|\.?)\b/gi, replacement: "Sq.mm" },
  ];

  phraseMap.forEach(({ pattern, replacement }) => {
    processedText = processedText.replace(pattern, replacement);
  });

  const svsVocabulary = [
    "Sudhakar", "Motor", "Submersible", "Texmo", "Aquatex", "Cable", "Wire",
    "Rewinding", "Condenser", "Ceiling", "Exhaust", "Starter", "Wiring", 
    "Switch", "Light", "Board", "Pipe", "Meter", "Meters", "Square", "Point",
    "Finolex", "Polycab", "Havells", "Pump", "Pumps", "Service", "HP"
  ];

  const phoneticMap: Record<string, string> = {
    // Single numbers
    "van": "1.5",
    "wan": "1",
    "tu": "2",
    "too": "2",
    "tri": "3",
    "fore": "4",
    "phaiv": "5",
    "phive": "5",
    "seks": "6",
    "siks": "6",
    "sevn": "7",
    "eyt": "8",
    "nayn": "9",
    
    // Terms
    "payimt": "Point",
    "payint": "Point",
    "cabel": "Cable",
    "kabel": "Cable",
    "wair": "Wire",
    "vayr": "Wire",
    "skwer": "Square",
    "skwear": "Square",
    "soorya": "Surya",
    "suriya": "Surya",
    "suria": "Surya",
    
    // Brands
    "phinolex": "Finolex",
    "policab": "Polycab",
    "havels": "Havells",
    "teksmo": "Texmo",
    "akwatex": "Aquatex",
    
    // Words
    "motar": "Motor",
    "moter": "Motor",
    "condensor": "Condenser",
    "condensr": "Condenser",
    "candenser": "Condenser",
    "candensor": "Condenser",
    "submersibal": "Submersible",
    "submergible": "Submersible",
    "pamp": "Pump",
    "pampu": "Pump",
    "stater": "Starter",
    "startar": "Starter",
    "statr": "Starter",
    "swich": "Switch",
    "bod": "Board",
    "pip": "Pipe",
    "paip": "Pipe",
    "celing": "Ceiling",
    "ciling": "Ceiling",
    "egzast": "Exhaust",
    "exast": "Exhaust",
    "exhast": "Exhaust",
    "leight": "Light",
    "lite": "Light",
    "miters": "Meters",
    "miter": "Meter",
    "rewainding": "Rewinding",
    "sarvice": "Service",
    "sarvis": "Service",
    "servis": "Service"
  };

  const words = processedText.split(/\s+/);
  const correctedWords = words.map(word => {
    const cleanWord = word.toLowerCase().replace(/[^a-z0-9.]/g, "");
    if (!cleanWord) return word;

    const hasPluralS = cleanWord.endsWith("s") && cleanWord.length > 3;
    const singularCleanWord = hasPluralS ? cleanWord.slice(0, -1) : cleanWord;

    let replacement: string | undefined;

    if (phoneticMap[cleanWord] !== undefined) {
      replacement = phoneticMap[cleanWord];
    } else if (hasPluralS && phoneticMap[singularCleanWord] !== undefined) {
      replacement = phoneticMap[singularCleanWord] + "s";
    }

    if (replacement !== undefined) {
      return word[0] === word[0].toUpperCase()
        ? replacement[0].toUpperCase() + replacement.slice(1)
        : replacement.toLowerCase();
    }

    for (const vocab of svsVocabulary) {
      const vocabLower = vocab.toLowerCase();
      
      if (cleanWord.length > 3 && getLevenshteinDistance(cleanWord, vocabLower) <= 2) {
        return word[0] === word[0].toUpperCase() ? vocab : vocab.toLowerCase();
      }
      
      if (hasPluralS && singularCleanWord.length > 3 && getLevenshteinDistance(singularCleanWord, vocabLower) <= 2) {
        const replacementPlural = vocab + "s";
        return word[0] === word[0].toUpperCase() ? replacementPlural : replacementPlural.toLowerCase();
      }
    }

    return word;
  });

  return correctedWords.join(" ");
}

function translateOrTransliterateTelugu(text: string): string {
  if (!text) return text;
  
  const teluguToEnglishMap: Record<string, string> = {
    "సుధాకర్": "Sudhakar",
    "హెచ్పి": "HP",
    "హెచ్.పి": "HP",
    "స్క్వేర్": "Square",
    "ఎం ఎం": "MM",
    "ఎమ్ ఎమ్": "MM",
    "ఎమ్ఎమ్": "MM",
    "కేబుల్": "Cable",
    "వైర్": "Wire",
    "మోటార్": "Motor",
    "మోటారు": "Motor",
    "రీవైండింగ్": "Rewinding",
    "సర్వీస్": "Service",
    "సర్వీసు": "Service",
    "ఫ్యాన్": "Fan",
    "ఫ్యాను": "Fan",
    "సీలింగ్": "Ceiling",
    "కండెన్సర్": "Condenser",
    "సబ్మెర్సిబుల్": "Submersible",
    "పంప్": "Pump",
    "పంపు": "Pump",
    "స్టార్టర్": "Starter",
    "వైరింగ్": "Wiring",
    "స్విచ్": "Switch",
    "లైట్": "Light",
    "బోర్డ్": "Board",
    "పైప్": "Pipe",
    "పైపు": "Pipe",
    "మీటర్లు": "Meters",
    "మీటర్": "Meter",
    "మీటరు": "Meter",
    "హైదరాబాద్": "Hyderabad",
    "దాటవేయి": "Skip",
    "అయిపోయింది": "Finish",
    "అవును": "Yes",
    "వద్దు": "No",
    "టాక్స్": "Tax"
  };

  let processedText = text;
  
  const sortedKeys = Object.keys(teluguToEnglishMap).sort((a, b) => b.length - a.length);
  
  sortedKeys.forEach(key => {
    const regex = new RegExp(key, "gi");
    processedText = processedText.replace(regex, teluguToEnglishMap[key]);
  });

  const teluguRegex = /[\u0C00-\u0C7F]/;
  const words = processedText.split(" ");
  
  const mappedWords = words.map(word => {
    if (teluguRegex.test(word)) {
      return transliterateTeluguToEnglish(word);
    }
    return word;
  });

  const translatedText = mappedWords.join(" ");
  return autocorrectElectricalTerminology(translatedText);
}

export default function App() {
  const [btype, setBtype] = useState<BillType>('gst');
  const [activeSec, setActiveSec] = useState<'create' | 'preview' | 'history'>('create');
  
  const [no, setNo] = useState("001");
  const [date, setDate] = useState("");
  const [po, setPo] = useState("");
  const [transport, setTransport] = useState("");
  
  const [cname, setCname] = useState("AVENUE SUPERMARTS LTD");
  const [caddr, setCaddr] = useState("");
  const [cgstin, setCgstin] = useState("36BXYPS4294L1Z7");
  
  const [sname, setSname] = useState("");
  const [saddr, setSaddr] = useState("");
  const [sgstin, setSgstin] = useState("");
  
  const [rows, setRows] = useState<Row[]>([
    { p: "", h: "", q: "", r: "", a: 0 },
    { p: "", h: "", q: "", r: "", a: 0 },
    { p: "", h: "", q: "", r: "", a: 0 },
  ]);
  
  const [applyGst, setApplyGst] = useState(true);
  const [bills, setBills] = useState<any[]>([]);
  
  const [dlMsg, setDlMsg] = useState("");
  const [showBanner, setShowBanner] = useState(false);

  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [previewHtml, setPreviewHtml] = useState("");

  const [signatureUrl, setSignatureUrl] = useState<string>("");
  const [isUploadingSig, setIsUploadingSig] = useState(false);

  const [dscFile, setDscFile] = useState<string>("");
  const [dscPassword, setDscPassword] = useState<string>("");

  const [isParsing, setIsParsing] = useState(false);
  const [showAiDrawer, setShowAiDrawer] = useState(false);
  const [fsmState, setFsmState] = useState<string>("IDLE");
  const [chatMessages, setChatMessages] = useState<any[]>([]);
  const [activeFieldFocus, setActiveFieldFocus] = useState<string>("btype");
  const [showResumeBanner, setShowResumeBanner] = useState(false);
  const [undoStack, setUndoStack] = useState<any[]>([]);
  const [redoStack, setRedoStack] = useState<any[]>([]);

  const pushToUndo = () => {
    const snapshot = {
      btype,
      cname,
      caddr,
      cgstin,
      applyGst,
      rows: JSON.parse(JSON.stringify(rows))
    };
    setUndoStack(prev => [...prev, snapshot]);
    setRedoStack([]);
  };
  
  const [fsmContext, setFsmContext] = useState<any>({
    btype: "gst",
    cname: "",
    caddr: "",
    cgstin: "",
    po: "",
    transport: "",
    rows: [],
    applyGst: true,
    currentItem: { p: "", h: "", q: "", r: "" },
    history: []
  });

  const {
    isListening,
    transcript,
    error: speechError,
    isSupported,
    language,
    startListening,
    stopListening,
    resetTranscript,
    changeLanguage
  } = useSpeechRecognition();

  const FSM_PROMPTS: Record<string, { en: string; te: string }> = {
    COLLECTING_DOC_TYPE: {
      en: "What type of document would you like to make? You can say GST Invoice, Quotation, or Cash Memo.",
      te: "నమస్తే! బిల్లు తయారు చేద్దామా. ఏ రకం బిల్లు కావాలి? GST ఇన్వాయిస్, కొటేషన్, లేదా క్యాష్ మెమో అని చెప్పండి."
    },
    COLLECTING_CUSTOMER_NAME: {
      en: "Great! What is the customer's name?",
      te: "మంచిది! కస్టమర్ పేరు ఏమిటి?"
    },
    COLLECTING_CUSTOMER_ADDR: {
      en: "Do you know the customer's address? You can speak the location or say 'skip'.",
      te: "కస్టమర్ అడ్రస్ తెలుసా? అడ్రస్ చెప్పండి లేదా 'స్కిప్' అని అనండి."
    },
    COLLECTING_ITEM_NAME: {
      en: "Let's add some products. What is the name of the product?",
      te: "ఇప్పుడు ప్రోడక్ట్స్ యాడ్ చేద్దాం. ప్రోడక్ట్ పేరు చెప్పండి (అయిపోతే 'అయిపోయింది' అనండి)."
    },
    COLLECTING_ITEM_QTY: {
      en: "What is the quantity?",
      te: "క్వాంటిటీ ఎంత?"
    },
    COLLECTING_ITEM_RATE: {
      en: "What is the rate per unit?",
      te: "ఒక్కదాని ధర ఎంత?"
    },
    CONFIRMING_TAX: {
      en: "Would you like to apply GST?",
      te: "GST అప్లై చేయాలా?"
    },
    SUMMARY_REVIEW: {
      en: "Invoice ready. Generate PDF invoice now?",
      te: "బిల్లు అంతా సిద్ధంగా ఉంది. ఇన్‌వాయిస్ పిడిఎఫ్ జనరేట్ చేయాలా?"
    },
    COMPLETE: {
      en: "Invoice generated successfully! PDF downloaded.",
      te: "ఇన్‌వాయిస్ విజయవంతంగా జనరేట్ అయింది! PDF డౌన్‌లోడ్ చేసాము."
    }
  };

  const speakText = (text: string, langCode: string) => {
    if (typeof window === "undefined" || !window.speechSynthesis) return;

    const wasListening = isListening;
    if (wasListening) {
      stopListening();
    }

    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = langCode;
    const voices = window.speechSynthesis.getVoices();
    const voice = voices.find((v) => v.lang.startsWith(langCode));
    if (voice) {
      utterance.voice = voice;
    }
    utterance.rate = 0.9;

    utterance.onend = () => {
      if (wasListening && showAiDrawer) {
        startListening();
      }
    };

    utterance.onerror = () => {
      if (wasListening && showAiDrawer) {
        startListening();
      }
    };

    window.speechSynthesis.speak(utterance);
  };

  const startConversationalAssistant = () => {
    setShowAiDrawer(true);
    resetTranscript();
    
    // Clear context and FSM
    setFsmState("COLLECTING_DOC_TYPE");
    setFsmContext({
      btype: "gst",
      cname: "",
      caddr: "",
      cgstin: "",
      po: "",
      transport: "",
      rows: [],
      applyGst: true,
      currentItem: { p: "", h: "", q: "", r: "" },
      history: []
    });

    const initialMsg = {
      sender: "ai" as const,
      text: FSM_PROMPTS.COLLECTING_DOC_TYPE.en,
      teText: FSM_PROMPTS.COLLECTING_DOC_TYPE.te,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    };
    
    setChatMessages([initialMsg]);
    setActiveFieldFocus("btype");

    const speakPhrase = language === "te-IN" ? FSM_PROMPTS.COLLECTING_DOC_TYPE.te : FSM_PROMPTS.COLLECTING_DOC_TYPE.en;
    speakText(speakPhrase, language);
  };

  const handleMicClick = () => {
    if (typeof window !== "undefined" && window.speechSynthesis) {
      window.speechSynthesis.cancel();
    }
    if (isListening) {
      stopListening();
    } else {
      resetTranscript();
      startListening();
    }
  };

  const handleConversationalInput = async (userInputText: string) => {
    if (!userInputText.trim()) return;

    // Add User message bubble
    const userMsg = {
      sender: "user" as const,
      text: userInputText,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    };
    setChatMessages(prev => [...prev, userMsg]);
    setIsParsing(true);

    try {
      const res = await fetch("/api/parse-voice", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          transcript: userInputText,
          currentState: fsmState,
          currentContext: fsmContext
        }),
      });

      let parsed;
      if (res.ok) {
        try {
          parsed = await res.json();
          if (!parsed || typeof parsed !== "object" || !parsed.intent) {
            console.warn("AI responded with incomplete JSON structure. Triggering rules fallback.");
            parsed = fallbackParseInput(userInputText, fsmState, language);
          }
        } catch (jsonErr) {
          console.warn("Failed to parse AI response JSON. Triggering rules fallback:", jsonErr);
          parsed = fallbackParseInput(userInputText, fsmState, language);
        }
      } else {
        const errorText = await res.text().catch(() => "Unknown error");
        console.warn(`AI dialogue parser endpoint returned ${res.status}: ${errorText}. Falling back to local rules-based parser.`);
        parsed = fallbackParseInput(userInputText, fsmState, language);
      }

      await handleFsmTransition(parsed, userInputText);
    } catch (err: any) {
      console.warn("AI dialogue parser exception. Falling back to local rule-based parser:", err);
      try {
        const parsed = fallbackParseInput(userInputText, fsmState, language);
        await handleFsmTransition(parsed, userInputText);
      } catch (fallbackErr: any) {
        console.error("Local fallback parser also failed:", fallbackErr);
        const errorMsg = {
          sender: "ai" as const,
          text: "Error: Could not parse input. Please try typing manually.",
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
        };
        setChatMessages(prev => [...prev, errorMsg]);
      }
    } finally {
      setIsParsing(false);
      resetTranscript();
    }
  };

  const handleFsmTransition = async (aiParsed: any, rawText: string) => {
    if (!aiParsed || typeof aiParsed !== "object") {
      console.warn("Invalid FSM dialog structure. Invoking rules fallback.");
      aiParsed = fallbackParseInput(rawText, fsmState, language);
    }

    const {
      value = null,
      intent = "NEXT",
      corrections = {},
      teFeedback = "",
      command = null
    } = aiParsed;
    
    let nextContext = { ...fsmContext };

    if (intent === "COMMAND" || command) {
      pushToUndo();
      const { type, data } = command;
      
      switch (type) {
        case "ADD_ITEM": {
          const pName = translateOrTransliterateTelugu(data.p || "Item");
          const qVal = String(data.q || "1").replace(/[^0-9.]/g, "");
          const rVal = String(data.r || "0").replace(/[^0-9.]/g, "");
          const unit = data.u || "Nos";
          const finalQty = qVal ? `${qVal} ${unit}` : `1 ${unit}`;
          
          const qtyNum = parseFloat(qVal) || 1;
          const rateNum = parseFloat(rVal) || 0;
          const amount = Math.round(qtyNum * rateNum * 100) / 100;
          
          const newRow = { p: pName, h: "", q: finalQty, r: rVal, a: amount };
          const updatedRows = [...rows.filter(r => r.p || r.h || r.q || r.r), newRow];
          setRows(updatedRows);
          nextContext.rows = updatedRows;
          break;
        }
        case "ADD_MULTI_ITEMS": {
          const itemsList = data.items || [];
          let updatedRows = [...rows.filter(r => r.p || r.h || r.q || r.r)];
          
          itemsList.forEach((it: any) => {
            const pName = translateOrTransliterateTelugu(it.p || "Item");
            const qVal = String(it.q || "1").replace(/[^0-9.]/g, "");
            const rVal = String(it.r || "0").replace(/[^0-9.]/g, "");
            const unit = it.u || "Nos";
            const finalQty = qVal ? `${qVal} ${unit}` : `1 ${unit}`;
            
            const qtyNum = parseFloat(qVal) || 1;
            const rateNum = parseFloat(rVal) || 0;
            const amount = Math.round(qtyNum * rateNum * 100) / 100;
            
            updatedRows.push({ p: pName, h: "", q: finalQty, r: rVal, a: amount });
          });
          
          setRows(updatedRows);
          nextContext.rows = updatedRows;
          break;
        }
        case "REMOVE_ITEM": {
          const searchName = String(data.p || "").toLowerCase().trim();
          const updatedRows = rows.filter(r => {
            if (!r.p) return false;
            return r.p.toLowerCase().trim() !== searchName;
          });
          setRows(updatedRows);
          nextContext.rows = updatedRows;
          break;
        }
        case "CHANGE_QUANTITY": {
          const searchName = String(data.p || "").toLowerCase().trim();
          const newQ = String(data.q || "1").replace(/[^0-9.]/g, "");
          
          const updatedRows = rows.map(r => {
            if (r.p && (searchName === "" || r.p.toLowerCase().includes(searchName))) {
              const existingUnit = r.q.replace(/[0-9.\s]/g, "") || "Nos";
              const finalQty = `${newQ} ${existingUnit}`;
              const qtyNum = parseFloat(newQ) || 1;
              const rateNum = parseFloat(r.r) || 0;
              const amount = Math.round(qtyNum * rateNum * 100) / 100;
              return { ...r, q: finalQty, a: amount };
            }
            return r;
          });
          setRows(updatedRows);
          nextContext.rows = updatedRows;
          break;
        }
        case "CHANGE_RATE": {
          const searchName = String(data.p || "").toLowerCase().trim();
          const newR = String(data.r || "0").replace(/[^0-9.]/g, "");
          
          const updatedRows = rows.map(r => {
            if (r.p && (searchName === "" || r.p.toLowerCase().includes(searchName))) {
              const qtyNum = parseFloat(r.q) || 1;
              const rateNum = parseFloat(newR) || 0;
              const amount = Math.round(qtyNum * rateNum * 100) / 100;
              return { ...r, r: newR, a: amount };
            }
            return r;
          });
          setRows(updatedRows);
          nextContext.rows = updatedRows;
          break;
        }
        case "APPLY_GST": {
          setApplyGst(true);
          nextContext.applyGst = true;
          break;
        }
        case "REMOVE_GST": {
          setApplyGst(false);
          nextContext.applyGst = false;
          break;
        }
        case "ADD_CUSTOMER": {
          if (data.cname) {
            const cleanCname = translateOrTransliterateTelugu(data.cname);
            setCname(cleanCname);
            nextContext.cname = cleanCname;
          }
          if (data.caddr) {
            const cleanCaddr = translateOrTransliterateTelugu(data.caddr);
            setCaddr(cleanCaddr);
            nextContext.caddr = cleanCaddr;
          }
          break;
        }
        case "GENERATE_PDF": {
          saveBill();
          localStorage.removeItem('svs_active_conv');
          setFsmState("COMPLETE");
          setTimeout(() => downloadPDF(), 500);
          break;
        }
        case "START_NEW": {
          resetForm();
          resetFsm();
          break;
        }
        case "CANCEL": {
          resetFsm();
          break;
        }
        case "UNDO": {
          const newUndoStack = [...undoStack];
          newUndoStack.pop(); // discard snapshot we just pushed
          setUndoStack(newUndoStack);
          
          if (newUndoStack.length > 0) {
            const prevSnapshot = newUndoStack[newUndoStack.length - 1];
            setBtype(prevSnapshot.btype);
            setCname(prevSnapshot.cname);
            setCaddr(prevSnapshot.caddr);
            setCgstin(prevSnapshot.cgstin);
            setApplyGst(prevSnapshot.applyGst);
            setRows(prevSnapshot.rows);
            nextContext.rows = prevSnapshot.rows;
            nextContext.cname = prevSnapshot.cname;
            nextContext.caddr = prevSnapshot.caddr;
            nextContext.applyGst = prevSnapshot.applyGst;
          }
          break;
        }
        case "REDO": {
          if (redoStack.length > 0) {
            const newRedoStack = [...redoStack];
            const nextSnapshot = newRedoStack.pop();
            setRedoStack(newRedoStack);
            
            if (nextSnapshot) {
              setBtype(nextSnapshot.btype);
              setCname(nextSnapshot.cname);
              setCaddr(nextSnapshot.caddr);
              setCgstin(nextSnapshot.cgstin);
              setApplyGst(nextSnapshot.applyGst);
              setRows(nextSnapshot.rows);
              nextContext.rows = nextSnapshot.rows;
              nextContext.cname = nextSnapshot.cname;
              nextContext.caddr = nextSnapshot.caddr;
              nextContext.applyGst = nextSnapshot.applyGst;
            }
          }
          break;
        }
        default:
          break;
      }
      
      setFsmContext(nextContext);
      
      const feedbackBubble = {
        sender: "ai" as const,
        text: `Command executed: ${type.replace("_", " ")}.`,
        teText: teFeedback || `ఆదేశాన్ని అమలు చేసాను.`,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      };
      setChatMessages(prev => [...prev, feedbackBubble]);
      
      const speakPhrase = language === "te-IN" 
        ? (teFeedback || "ఆదేశాన్ని అమలు చేసాను.") 
        : `Command executed: ${type.replace("_", " ")}.`;
      speakText(speakPhrase, language);
      return;
    }

    if (intent === "CORRECT" && corrections) {
      pushToUndo();
      Object.keys(corrections).forEach(path => {
        let val = corrections[path];
        if (typeof val === "string") {
          val = translateOrTransliterateTelugu(val);
        }
        if (path === "cname") { setCname(val); nextContext.cname = val; }
        else if (path === "caddr") { setCaddr(val); nextContext.caddr = val; }
        else if (path === "applyGst") { setApplyGst(val === true); nextContext.applyGst = val === true; }
        else if (path === "btype") { setBtype(val); nextContext.btype = val; }
      });
      setFsmContext(nextContext);
      
      const correctionBubble = {
        sender: "ai" as const,
        text: `Correction applied successfully.`,
        teText: teFeedback || `సవరణలు చేసాను.`,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      };
      setChatMessages(prev => [...prev, correctionBubble]);

      const speakPhrase = language === "te-IN" ? (teFeedback || "సవరణలు చేసాను.") : "Correction applied successfully.";
      speakText(speakPhrase, language);
      return;
    }

    if (intent === "PREVIOUS") {
      const history = [...fsmContext.history];
      if (history.length > 0) {
        const prevState = history.pop() as string;
        setFsmState(prevState);
        nextContext.history = history;
        setFsmContext(nextContext);
        
        const prompts = (FSM_PROMPTS as any)[prevState];
        const goBackBubble = {
          sender: "ai" as const,
          text: `Going back. ${prompts.en}`,
          teText: prompts.te,
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
        };
        setChatMessages(prev => [...prev, goBackBubble]);

        const speakPhrase = language === "te-IN" ? `వెనక్కి వెళ్తున్నాము. ${prompts.te}` : `Going back. ${prompts.en}`;
        speakText(speakPhrase, language);
      } else {
        const cannotGoBackMsg = {
          sender: "ai" as const,
          text: "Already at the beginning of document creation.",
          teText: "ఇదే మొదటి స్టెప్, వెనక్కి వెళ్ళలేము.",
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
        };
        setChatMessages(prev => [...prev, cannotGoBackMsg]);

        const speakPhrase = language === "te-IN" ? "ఇదే మొదటి స్టెప్, వెనక్కి వెళ్ళలేము." : "Already at the beginning of document creation.";
        speakText(speakPhrase, language);
      }
      return;
    }

    if (intent === "REPEAT") {
      const prompts = (FSM_PROMPTS as any)[fsmState];
      const repeatBubble = {
        sender: "ai" as const,
        text: prompts.en,
        teText: prompts.te,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      };
      setChatMessages(prev => [...prev, repeatBubble]);

      const speakPhrase = language === "te-IN" ? prompts.te : prompts.en;
      speakText(speakPhrase, language);
      return;
    }

    // Default flow: intent === "NEXT"
    pushToUndo();
    nextContext.history = [...fsmContext.history, fsmState];
    let nextState = fsmState;

    switch (fsmState) {
      case "COLLECTING_DOC_TYPE": {
        const val = value || "gst";
        setBtype(val as any);
        nextContext.btype = val;
        nextState = "COLLECTING_CUSTOMER_NAME";
        setActiveFieldFocus("cname");
        break;
      }
      case "COLLECTING_CUSTOMER_NAME": {
        const val = value || "Cash Customer";
        const cleanVal = translateOrTransliterateTelugu(val as string);
        setCname(cleanVal);
        nextContext.cname = cleanVal;
        nextState = "COLLECTING_CUSTOMER_ADDR";
        setActiveFieldFocus("caddr");
        break;
      }
      case "COLLECTING_CUSTOMER_ADDR": {
        const val = value === "skip" || !value ? "" : value;
        const cleanVal = translateOrTransliterateTelugu(val as string);
        setCaddr(cleanVal);
        nextContext.caddr = cleanVal;
        nextState = "COLLECTING_ITEM_NAME";
        setActiveFieldFocus("rows-particulars");
        break;
      }
      case "COLLECTING_ITEM_NAME": {
        if (value === "finish") {
          const nonElItems = rows.filter(r => r.p.trim() !== "");
          if (nonElItems.length === 0) {
            nextState = "COLLECTING_ITEM_NAME";
            setActiveFieldFocus("rows-particulars");
            
            const noItemBubble = {
              sender: "ai" as const,
              text: "Please add at least one product before finishing.",
              teText: "దయచేసి కనీసం ఒక ప్రోడక్ట్ అయినా బిల్లులో చేర్చండి.",
              timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
            };
            setChatMessages(prev => [...prev, noItemBubble]);
            
            const speakPhrase = language === "te-IN"
              ? "దయచేసి కనీసం ఒక ప్రోడక్ట్ అయినా బిల్లులో చేర్చండి."
              : "Please add at least one product before finishing.";
            speakText(speakPhrase, language);
            return;
          }
          nextState = "CONFIRMING_TAX";
          setActiveFieldFocus("apply-gst");
        } else {
          const val = value || "";
          const cleanVal = translateOrTransliterateTelugu(val as string);
          nextContext.currentItem = { p: cleanVal, h: "", q: "", r: "" };
          nextState = "COLLECTING_ITEM_QTY";
          setActiveFieldFocus("rows-qty");
        }
        break;
      }
      case "COLLECTING_ITEM_QTY": {
        const rawVal = String(value || "1");
        const sanitizedVal = rawVal.replace(/[^0-9.]/g, "");
        const finalVal = sanitizedVal || "1";
        nextContext.currentItem.q = finalVal;
        nextState = "COLLECTING_ITEM_RATE";
        setActiveFieldFocus("rows-rate");
        break;
      }
      case "COLLECTING_ITEM_RATE": {
        const rawVal = String(value || "0");
        const sanitizedVal = rawVal.replace(/[^0-9.]/g, "");
        const finalVal = sanitizedVal || "0";
        nextContext.currentItem.r = finalVal;
        
        const qty = parseFloat(nextContext.currentItem.q) || 0;
        const rate = parseFloat(finalVal) || 0;
        const amount = Math.round(qty * rate * 100) / 100;
        
        const newRow = {
          p: nextContext.currentItem.p,
          h: "",
          q: nextContext.currentItem.q,
          r: finalVal,
          a: amount
        };

        const updatedRows = [...rows.filter(r => r.p || r.h || r.q || r.r), newRow];
        setRows(updatedRows);
        nextContext.rows = updatedRows;
        
        nextContext.currentItem = { p: "", h: "", q: "", r: "" };
        nextState = "COLLECTING_ITEM_NAME";
        setActiveFieldFocus("rows-particulars");
        break;
      }
      case "CONFIRMING_TAX": {
        const val = value === undefined ? true : value;
        setApplyGst(!!val);
        nextContext.applyGst = !!val;
        nextState = "SUMMARY_REVIEW";
        setActiveFieldFocus("actions");
        break;
      }
      case "SUMMARY_REVIEW": {
        if (value === "yes") {
          nextState = "COMPLETE";
          saveBill();
          localStorage.removeItem('svs_active_conv');
          setTimeout(() => downloadPDF(), 500);
        } else {
          nextState = "IDLE";
          setShowAiDrawer(false);
          localStorage.removeItem('svs_active_conv');
        }
        break;
      }
      default:
        break;
    }

    setFsmState(nextState);
    setFsmContext(nextContext);

    const prompts = (FSM_PROMPTS as any)[nextState];
    if (prompts) {
      const nextBubble = {
        sender: "ai" as const,
        text: prompts.en,
        teText: prompts.te,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      };
      setChatMessages(prev => {
        if (teFeedback) {
          return [
            ...prev,
            {
              sender: "ai" as const,
              text: `Acknowledged.`,
              teText: teFeedback,
              timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
            },
            nextBubble
          ];
        }
        return [...prev, nextBubble];
      });

      const verbalFeedback = teFeedback ? `${teFeedback}. ` : "";
      const speakPrompt = language === "te-IN" ? prompts.te : prompts.en;
      const speakPhrase = language === "te-IN" ? (verbalFeedback + speakPrompt) : speakPrompt;
      speakText(speakPhrase, language);
    }
  };

  const prevIsListening = useRef(false);

  useEffect(() => {
    if (prevIsListening.current && !isListening && transcript.trim()) {
      if (showAiDrawer) {
        handleConversationalInput(transcript);
      }
    }
    prevIsListening.current = isListening;
  }, [isListening, transcript, showAiDrawer]);

  const handleCloseDrawer = () => {
    setShowAiDrawer(false);
    window.speechSynthesis.cancel();
    stopListening();
  };

  const handleLanguageChange = (lang: string) => {
    changeLanguage(lang);
    window.speechSynthesis.cancel();
    const announcement = lang === "te-IN" 
      ? "భాష తెలుగులోకి మార్చబడింది" 
      : "Language changed to English";
    speakText(announcement, lang);
  };

  const handleResumeFsm = () => {
    try {
      const savedConv = localStorage.getItem('svs_active_conv');
      if (savedConv) {
        const { state, context, messages } = JSON.parse(savedConv);
        setFsmState(state);
        setFsmContext(context);
        setChatMessages(messages);
        
        if (context.btype) setBtype(context.btype);
        if (context.cname) setCname(context.cname);
        if (context.caddr) setCaddr(context.caddr);
        if (context.cgstin) setCgstin(context.cgstin);
        if (context.applyGst !== undefined) setApplyGst(context.applyGst);
        if (context.rows && context.rows.length > 0) setRows(context.rows);
        
        setShowAiDrawer(true);
      }
    } catch (e) {
      console.error("Failed to restore FSM draft:", e);
    }
    setShowResumeBanner(false);
  };

  const handleDiscardFsmDraft = () => {
    localStorage.removeItem('svs_active_conv');
    setShowResumeBanner(false);
  };

  const resetFsm = () => {
    setFsmState("IDLE");
    setShowAiDrawer(false);
    resetTranscript();
    localStorage.removeItem('svs_active_conv');
    window.speechSynthesis.cancel();
    stopListening();
  };

  useEffect(() => {
    if (fsmState !== "IDLE" && fsmState !== "COMPLETE") {
      const draft = {
        state: fsmState,
        context: fsmContext,
        messages: chatMessages
      };
      localStorage.setItem('svs_active_conv', JSON.stringify(draft));
    }
  }, [fsmState, fsmContext, chatMessages]);

  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem('svs4') || '[]');
      setBills(saved);
      const nums = saved.map((b: any) => parseInt(b.no)).filter((n: number) => !isNaN(n));
      setNo(String(nums.length ? Math.max(...nums) + 1 : 1).padStart(3, '0'));
      const savedSig = localStorage.getItem('svs_sig');
      if (savedSig) setSignatureUrl(savedSig);
      const savedDsc = localStorage.getItem('svs_dsc');
      if (savedDsc) setDscFile(savedDsc);
      const savedDscPwd = localStorage.getItem('svs_dsc_pwd');
      if (savedDscPwd) setDscPassword(savedDscPwd);
      
      const savedConv = localStorage.getItem('svs_active_conv');
      if (savedConv) {
        setShowResumeBanner(true);
      }
    } catch (e) {}
    setDate(new Date().toISOString().split('T')[0]);
  }, []);

  const addRow = (p='', h='', q='', r='', a=0) => {
    setRows([...rows, { p, h, q, r, a }]);
  };

  const upd = (i: number, field: keyof Row, val: string) => {
    const newRows = [...rows];
    (newRows[i] as any)[field] = val;
    
    const q = parseFloat(newRows[i].q) || 0;
    const r = parseFloat(newRows[i].r) || 0;
    
    if (q > 0 && r > 0) {
      newRows[i].a = Math.round(q * r * 100) / 100;
    } else if (field === 'a') {
      newRows[i].a = parseFloat(val) || 0;
    }
    setRows(newRows);
  };

  const delRow = (i: number) => {
    const newRows = [...rows];
    newRows.splice(i, 1);
    setRows(newRows);
  };

  const sub = rows.reduce((s, x) => s + (parseFloat(x.a as any) || 0), 0);
  const isGst = applyGst && btype !== 'cash';
  const cgst = isGst ? Math.round(sub * 0.09 * 100) / 100 : 0;
  const sgst = isGst ? Math.round(sub * 0.09 * 100) / 100 : 0;
  const grand = sub + cgst + sgst;

  const fmtD = (n: number) => 'Rs. ' + (Math.round(n * 100) / 100).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  const getData = () => ({
    type: btype, no, date, po, transport, cname, caddr, cgstin,
    sname, saddr, sgstin, rows, applyGst: isGst,
    sub, cgst, sgst, grand, saved: new Date().toISOString(), signatureUrl
  });

  const handleSignatureUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsUploadingSig(true);
    try {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onloadend = async () => {
        const base64data = reader.result;
        const res = await fetch("/api/upload-signature", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ image: base64data }),
        });
        const data = await res.json();
        if (data.url) {
          setSignatureUrl(data.url);
          localStorage.setItem('svs_sig', data.url);
        } else {
          alert("Upload failed: " + (data.error || "Unknown error"));
        }
        setIsUploadingSig(false);
      };
    } catch (err) {
      console.error(err);
      setIsUploadingSig(false);
      alert("Upload failed");
    }
  };

  const handleDscUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onloadend = () => {
      const base64data = (reader.result as string).split(',')[1];
      setDscFile(base64data);
      localStorage.setItem('svs_dsc', base64data);
    };
  };

  const handleDscPasswordChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setDscPassword(val);
    localStorage.setItem('svs_dsc_pwd', val);
  };

  const saveBill = () => {
    const d = getData();
    const newBills = [...bills];
    const idx = newBills.findIndex(b => b.no === d.no && b.type === d.type);
    if (idx >= 0) newBills[idx] = d;
    else newBills.unshift(d);
    
    setBills(newBills);
    try { localStorage.setItem('svs4', JSON.stringify(newBills)) } catch (e) {}
    setActiveSec('history');
  };

  const loadBill = (i: number) => {
    const d = bills[i];
    setBtype(d.type);
    setNo(d.no || '');
    setDate(d.date || '');
    setPo(d.po || '');
    setTransport(d.transport || '');
    setCname(d.cname || '');
    setCaddr(d.caddr || '');
    setCgstin(d.cgstin || '');
    setSname(d.sname || '');
    setSaddr(d.saddr || '');
    setSgstin(d.sgstin || '');
    setApplyGst(!!d.applyGst);
    setRows(d.rows || []);
    setSignatureUrl(d.signatureUrl || localStorage.getItem('svs_sig') || "");
    setActiveSec('create');
  };

  const delBill = (i: number) => {
    if (!confirm('Delete this bill?')) return;
    const newBills = [...bills];
    newBills.splice(i, 1);
    setBills(newBills);
    try { localStorage.setItem('svs4', JSON.stringify(newBills)) } catch (e) {}
  };

  const resetForm = () => {
    setCaddr(''); setSname(''); setSaddr(''); setSgstin(''); setPo(''); setTransport('');
    setCname('AVENUE SUPERMARTS LTD');
    setCgstin('36BXYPS4294L1Z7');
    setRows([{ p: "", h: "", q: "", r: "", a: 0 }, { p: "", h: "", q: "", r: "", a: 0 }, { p: "", h: "", q: "", r: "", a: 0 }]);
    const nums = bills.map((b: any) => parseInt(b.no)).filter((n: number) => !isNaN(n));
    setNo(String(nums.length ? Math.max(...nums) + 1 : 1).padStart(3, '0'));
  };

  const [isDownloading, setIsDownloading] = useState(false);

  useEffect(() => {
    if (activeSec === 'preview') {
      setPreviewHtml(invHTML(getData()));
    }
  }, [activeSec, btype, no, date, po, transport, cname, caddr, cgstin, sname, saddr, sgstin, rows, applyGst, signatureUrl]);

  const downloadPDF = () => {
    setIsDownloading(true);
    const d = getData();
    const iframe = iframeRef.current;
    if (!iframe) return;

    const h = invHTML(d);
    const doc = iframe.contentDocument;
    if (!doc) return;

    doc.open();
    doc.write(h);
    doc.close();

    setTimeout(() => {
      const invEl = doc.querySelector('.inv') as HTMLElement;
      if (!invEl) {
        setIsDownloading(false);
        return;
      }

      html2canvas(invEl, {
        scale: 2,
        useCORS: true,
        backgroundColor: '#ffffff',
        logging: false,
        width: 794,
        height: 1123
      }).then(async (canvas) => {
        const imgData = canvas.toDataURL('image/png');
        const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
        const pdfW = pdf.internal.pageSize.getWidth();
        const pdfH = pdf.internal.pageSize.getHeight();
        pdf.addImage(imgData, 'PNG', 0, 0, pdfW, pdfH);
        
        const fname = `SVS_${d.type.toUpperCase()}_${d.no}_${(d.date || '').replace(/-/g, '')}_${(d.cname || 'bill').replace(/[^a-zA-Z0-9]/g, '_')}.pdf`;
        
        if (dscFile && dscPassword) {
          try {
            // Get raw PDF base64 (remove data URI prefix)
            const pdfBase64 = pdf.output('datauristring').split(',')[1];
            
            const res = await fetch("/api/sign-pdf", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                pdfBase64,
                p12Base64: dscFile,
                password: dscPassword
              }),
            });
            
            const result = await res.json();
            
            if (result.signedPdfBase64) {
              const link = document.createElement('a');
              link.href = `data:application/pdf;base64,${result.signedPdfBase64}`;
              link.download = fname.replace('.pdf', '_signed.pdf');
              link.click();
            } else {
              alert("Signing failed: " + result.error);
              pdf.save(fname); // fallback
            }
          } catch (err) {
            console.error("Signing error", err);
            alert("Error applying DSC signature. Downloading unsigned PDF.");
            pdf.save(fname);
          }
        } else {
          pdf.save(fname);
        }
        
        setIsDownloading(false);
        setDlMsg('PDF downloaded' + (dscFile && dscPassword ? ' (Signed)' : '') + ': ' + fname);
        setShowBanner(true);
        setTimeout(() => setShowBanner(false), 4000);
      }).catch(() => setIsDownloading(false));
    }, 600);
  };

  return (
    <div className="app">
      {showResumeBanner && (
        <div
          style={{
            backgroundColor: "#fff8eb",
            borderBottom: "1px solid #fee2e2",
            padding: "10px 16px",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            fontSize: "12px",
            color: "#b45309",
            fontWeight: 500,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <span style={{ fontSize: "14px" }}>💡</span>
            <span>
              {language === "te-IN"
                ? "మునుపటి వాయిస్ బిల్లింగ్ సెషన్ కనుగొనబడింది. దాన్ని కొనసాగిస్తారా?"
                : "An incomplete AI Billing Assistant draft was found. Do you want to resume?"}
            </span>
          </div>
          <div style={{ display: "flex", gap: "8px" }}>
            <button
              onClick={handleResumeFsm}
              className="btn btn-sm btn-blue"
              style={{
                padding: "4px 10px",
                fontSize: "11px",
                backgroundColor: "#003399",
                color: "#fff",
                border: "none",
                borderRadius: "4px",
                cursor: "pointer",
              }}
            >
              {language === "te-IN" ? "కొనసాగించు" : "Resume"}
            </button>
            <button
              onClick={handleDiscardFsmDraft}
              className="btn btn-sm btn-red"
              style={{
                padding: "4px 10px",
                fontSize: "11px",
                backgroundColor: "#ef4444",
                color: "#fff",
                border: "none",
                borderRadius: "4px",
                cursor: "pointer",
              }}
            >
              {language === "te-IN" ? "వద్దు" : "Discard"}
            </button>
          </div>
        </div>
      )}
      <div className="topbar">
        <div className="topbar-title">SVS Billing</div>
        <div className="tabs" style={{ display: "flex", gap: "8px", alignItems: "center", flexWrap: "wrap" }}>
          <button
            type="button"
            className="btn btn-blue"
            onClick={startConversationalAssistant}
            style={{
              display: "flex",
              alignItems: "center",
              gap: "6px",
              background: "linear-gradient(135deg, #003399, #1d4ed8)",
              color: "#fff",
              border: "none",
              boxShadow: "0 2px 4px rgba(29, 78, 216, 0.2)",
              cursor: "pointer",
            }}
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="14"
              height="14"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth="2.5"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M9.813 15.904L9 21l-1.813-5.096L2 14l5.096-1.813L9 7l1.813 5.096L14 14l-5.096 1.813zM19.071 4.929l-.707 1.97-.707-1.97-1.97-.707 1.97-.707.707-1.97.707 1.97 1.97.707-1.97.707zM19.071 19.071l-.707 1.97-.707-1.97-1.97-.707 1.97-.707.707-1.97.707 1.97 1.97.707-1.97.707z"
              />
            </svg>
            <span style={{ fontWeight: 600 }}>Create Invoice with AI</span>
          </button>
          <div className={`tab ${btype === 'gst' ? 'on' : ''}`} onClick={() => setBtype('gst')}>GST Invoice</div>
          <div className={`tab ${btype === 'quotation' ? 'on' : ''}`} onClick={() => setBtype('quotation')}>Quotation</div>
          <div className={`tab ${btype === 'cash' ? 'on' : ''}`} onClick={() => setBtype('cash')}>Cash Memo</div>
        </div>
      </div>

      <div className="nav">
        <div className={`nav-tab ${activeSec === 'create' ? 'on' : ''}`} onClick={() => setActiveSec('create')}>Create</div>
        <div className={`nav-tab ${activeSec === 'preview' ? 'on' : ''}`} onClick={() => setActiveSec('preview')}>Preview</div>
        <div className={`nav-tab ${activeSec === 'history' ? 'on' : ''}`} onClick={() => setActiveSec('history')}>History (<span id="hc">{bills.length}</span>)</div>
      </div>

      {activeSec === 'create' && (
        <div id="sec-create">
          <div className="card">
            <div className="card-title">Bill Details</div>
            <div className="g2">
              <div className="field"><label>Bill No.</label><input value={no} onChange={e => setNo(e.target.value)} /></div>
              <div className="field"><label>Date</label><input type="date" value={date} onChange={e => setDate(e.target.value)} /></div>
            </div>
            <div className="g2">
              <div className="field"><label>PO Number</label><input value={po} onChange={e => setPo(e.target.value)} placeholder="Optional" /></div>
              <div className="field"><label>Transport Mode</label><input value={transport} onChange={e => setTransport(e.target.value)} placeholder="Optional" /></div>
            </div>
          </div>
          <div className="card">
            <div className="card-title">Bill To Party</div>
            <div className="field"><label>Customer Name</label><input value={cname} onChange={e => setCname(e.target.value)} onBlur={e => setCname(translateOrTransliterateTelugu(e.target.value))} placeholder="e.g. Avenue Supermarts Ltd." style={{ borderColor: activeFieldFocus === 'cname' ? '#003399' : '', boxShadow: activeFieldFocus === 'cname' ? '0 0 0 3px rgba(0, 51, 153, 0.2)' : '' }} /></div>
            <div className="field"><label>Address</label><input value={caddr} onChange={e => setCaddr(e.target.value)} onBlur={e => setCaddr(translateOrTransliterateTelugu(e.target.value))} placeholder="e.g. Medipally D-Mart" style={{ borderColor: activeFieldFocus === 'caddr' ? '#003399' : '', boxShadow: activeFieldFocus === 'caddr' ? '0 0 0 3px rgba(0, 51, 153, 0.2)' : '' }} /></div>
            <div className="field"><label>GSTIN</label><input value={cgstin} onChange={e => setCgstin(e.target.value)} placeholder="Optional" /></div>
          </div>
          <div className="card">
            <div className="card-title">Ship To Party <span style={{ fontSize: "10px", textTransform: "none", fontWeight: 400, color: "var(--color-text-secondary)" }}>(Optional)</span></div>
            <div className="field"><label>Name</label><input value={sname} onChange={e => setSname(e.target.value)} onBlur={e => setSname(translateOrTransliterateTelugu(e.target.value))} placeholder="Leave blank if same as Bill To" /></div>
            <div className="field"><label>Address</label><input value={saddr} onChange={e => setSaddr(e.target.value)} onBlur={e => setSaddr(translateOrTransliterateTelugu(e.target.value))} placeholder="Optional" /></div>
            <div className="field"><label>GSTIN</label><input value={sgstin} onChange={e => setSgstin(e.target.value)} placeholder="Optional" /></div>
          </div>
          <div className="card">
            <div className="card-title">Line Items</div>
            <div className="items-wrap">
              <table className="it">
                <thead><tr>
                  <th style={{ width: "24px" }}>#</th>
                  <th style={{ minWidth: "120px" }}>Particulars</th>
                  <th style={{ width: "55px" }}>HSN/SAC</th>
                  <th style={{ width: "45px" }}>Qty</th>
                  <th style={{ width: "70px" }}>Rate (Rs.)</th>
                  <th style={{ width: "70px" }}>Amount</th>
                  <th style={{ width: "28px" }}></th>
                </tr></thead>
                <tbody>
                  {rows.map((r, i) => (
                    <tr key={i}>
                      <td style={{ textAlign: "center", color: "#888" }}>{i + 1}</td>
                      <td data-lbl="Particulars"><input value={r.p} placeholder="Description" onChange={e => upd(i, 'p', e.target.value)} onBlur={e => upd(i, 'p', translateOrTransliterateTelugu(e.target.value))} style={{ borderColor: (activeFieldFocus === 'rows-particulars' && i === rows.length - 1) ? '#003399' : '', boxShadow: (activeFieldFocus === 'rows-particulars' && i === rows.length - 1) ? '0 0 0 3px rgba(0, 51, 153, 0.2)' : '' }} /></td>
                      <td data-lbl="HSN/SAC"><input value={r.h} placeholder="HSN" onChange={e => upd(i, 'h', e.target.value)} /></td>
                      <td data-lbl="Qty"><input type="text" value={r.q} placeholder="0" onChange={e => upd(i, 'q', e.target.value)} style={{ borderColor: (activeFieldFocus === 'rows-qty' && i === rows.length - 1) ? '#003399' : '', boxShadow: (activeFieldFocus === 'rows-qty' && i === rows.length - 1) ? '0 0 0 3px rgba(0, 51, 153, 0.2)' : '' }} /></td>
                      <td data-lbl="Rate (Rs.)"><input type="number" min="0" value={r.r} placeholder="0" onChange={e => upd(i, 'r', e.target.value)} style={{ borderColor: (activeFieldFocus === 'rows-rate' && i === rows.length - 1) ? '#003399' : '', boxShadow: (activeFieldFocus === 'rows-rate' && i === rows.length - 1) ? '0 0 0 3px rgba(0, 51, 153, 0.2)' : '' }} /></td>
                      <td className="amt" data-lbl="Amount">{r.a ? r.a.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '0.00'}</td>
                      <td><button className="btn btn-red btn-sm" onClick={() => delRow(i)}>x</button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <button className="btn btn-sm" onClick={() => addRow()}>+ Add Item</button>
            <div style={{ marginTop: "10px" }}>
              <label style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "12px", cursor: "pointer" }}>
                <input type="checkbox" checked={applyGst} onChange={e => setApplyGst(e.target.checked)} style={{ width: "auto" }} /> Apply GST (CGST 9% + SGST 9%)
              </label>
            </div>
            <div className="totals-box" style={{ marginTop: "10px" }}>
              <div className="tline"><span className="lbl">Subtotal</span><span>{fmtD(sub)}</span></div>
              <div className="tline"><span className="lbl">CGST @ 9%</span><span>{fmtD(cgst)}</span></div>
              <div className="tline"><span className="lbl">SGST @ 9%</span><span>{fmtD(sgst)}</span></div>
              <div className="tline grand"><span className="lbl">Grand Total</span><span>{fmtD(grand)}</span></div>
            </div>
          </div>
          <div className="card">
            <div className="card-title">Settings & Signature</div>
            <div className="g2">
              <div className="field">
                <label>Authorized Signatory Signature (Image)</label>
                <input type="file" accept="image/*" onChange={handleSignatureUpload} disabled={isUploadingSig} />
                {isUploadingSig && <div style={{ fontSize: "12px", color: "#003399", marginTop: "4px" }}>Uploading signature...</div>}
                {signatureUrl && (
                  <div style={{ marginTop: "10px", display: "flex", alignItems: "center", gap: "10px" }}>
                    <img src={signatureUrl} alt="Signature" style={{ maxHeight: "45px", border: "1px solid #e2e8f0", padding: "2px", borderRadius: "4px", background: "#fff" }} />
                    <button className="btn btn-sm btn-red" onClick={() => { setSignatureUrl(''); localStorage.removeItem('svs_sig'); }}>Remove</button>
                  </div>
                )}
              </div>
              <div className="field">
                <label>DSC Certificate (.p12 / .pfx)</label>
                <input type="file" accept=".p12,.pfx" onChange={handleDscUpload} />
                {dscFile && <div style={{ fontSize: "12px", color: "green", marginTop: "4px" }}>✓ Certificate loaded</div>}
                {dscFile && (
                  <div style={{ marginTop: "8px" }}>
                    <label>DSC Password</label>
                    <input type="password" value={dscPassword} onChange={handleDscPasswordChange} placeholder="Certificate Password" />
                  </div>
                )}
                {dscFile && (
                  <button className="btn btn-sm btn-red" style={{marginTop:"8px"}} onClick={() => { setDscFile(''); setDscPassword(''); localStorage.removeItem('svs_dsc'); localStorage.removeItem('svs_dsc_pwd'); }}>Remove DSC</button>
                )}
              </div>
            </div>
          </div>
          <div className="act-row">
            <button className="btn" onClick={resetForm}>Reset</button>
            <button className="btn" onClick={() => setActiveSec('preview')}>Preview</button>
            <button className="btn btn-blue" onClick={saveBill}>Save Bill</button>
          </div>
        </div>
      )}

      {activeSec === 'preview' && (
        <div id="sec-preview">
          <div className={`dl-banner ${showBanner ? 'show' : ''}`} id="dl-banner">
            <span style={{ fontSize: "16px" }}>✓</span>
            <span>{dlMsg}</span>
          </div>
          <div className="prev-wrap">
            <div dangerouslySetInnerHTML={{ __html: previewHtml }}></div>
          </div>
          <div className="act-row">
            <button className="btn" onClick={() => setActiveSec('create')}>← Edit</button>
            <button className="btn btn-blue" onClick={saveBill}>Save</button>
            <button className="btn btn-green" onClick={downloadPDF} disabled={isDownloading}>
              {isDownloading ? 'Generating...' : '⬇ Download PDF'}
            </button>
          </div>
          {/* Hidden iframe for PDF generation to ensure perfect rendering outside flexboxes */}
          <iframe ref={iframeRef} style={{ position: "absolute", left: "-9999px", top: "-9999px", width: "794px", height: "1123px", border: "none" }} />
        </div>
      )}

      {activeSec === 'history' && (
        <div id="sec-history">
          {!bills.length ? (
            <div className="empty">No saved bills yet.</div>
          ) : (
            bills.map((b, i) => (
              <div key={i} className="hist-item" onClick={() => loadBill(i)}>
                <div style={{ flex: 1 }}>
                  <div className="hi-no">#{b.no}
                    {b.type === 'gst' && <span className="tag tag-gst">GST</span>}
                    {b.type === 'quotation' && <span className="tag tag-q">Quotation</span>}
                    {b.type === 'cash' && <span className="tag tag-c">Cash Memo</span>}
                  </div>
                  <div className="hi-meta">{b.cname || '—'} &nbsp;·&nbsp; {b.date || '—'}</div>
                </div>
                <div className="hi-amt">Rs.{fmtD(b.grand).replace('Rs. ', '')}</div>
                <div style={{ display: "flex", gap: "4px" }} onClick={e => e.stopPropagation()}>
                  <button className="btn btn-sm" onClick={() => loadBill(i)}>Edit</button>
                  <button className="btn btn-green btn-sm" onClick={() => { loadBill(i); setTimeout(() => setActiveSec('preview'), 100); }}>PDF</button>
                  <button className="btn btn-red btn-sm" onClick={() => delBill(i)}>Del</button>
                </div>
              </div>
            ))
          )}
        </div>
      )}
      <ConversationalDrawer
        isOpen={showAiDrawer}
        onClose={handleCloseDrawer}
        messages={chatMessages}
        isListening={isListening}
        language={language}
        onLanguageChange={handleLanguageChange}
        onMicClick={handleMicClick}
        onTextInput={handleConversationalInput}
        isParsing={isParsing}
        currentState={fsmState}
        contextData={fsmContext}
        onConfirmAndApply={() => {}}
        onReset={resetFsm}
        speechError={speechError}
        isSpeechSupported={isSupported}
      />
    </div>
  );
}
