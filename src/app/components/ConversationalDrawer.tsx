"use client";

import React, { useState, useRef, useEffect } from "react";

interface Message {
  sender: "ai" | "user";
  text: string; // English
  teText?: string; // Telugu
  timestamp: string;
}

interface ConversationalDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  messages: Message[];
  isListening: boolean;
  language: string;
  onLanguageChange: (lang: string) => void;
  onMicClick: () => void;
  onTextInput: (text: string) => void;
  isParsing: boolean;
  currentState: string;
  contextData: any;
  onConfirmAndApply: () => void;
  onReset: () => void;
  onRowChange?: (index: number, field: string, val: string) => void;
  onFieldChange?: (field: string, val: any) => void;
  speechError?: string | null;
  isSpeechSupported?: boolean;
}

export default function ConversationalDrawer({
  isOpen,
  onClose,
  messages,
  isListening,
  language,
  onLanguageChange,
  onMicClick,
  onTextInput,
  isParsing,
  currentState,
  contextData,
  onConfirmAndApply,
  onReset,
  onRowChange,
  onFieldChange,
  speechError = null,
  isSpeechSupported = true,
}: ConversationalDrawerProps) {
  const [inputText, setInputText] = useState("");
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Scroll to bottom of message panel
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isListening, isParsing]);

  if (!isOpen) return null;

  const handleSendText = (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputText.trim()) return;
    onTextInput(inputText);
    setInputText("");
  };

  const handlePillClick = (val: string) => {
    onTextInput(val);
  };

  // Generate helper suggestion pills based on FSM state
  const getPillsForState = () => {
    switch (currentState) {
      case "COLLECTING_DOC_TYPE":
        return [
          { label: "GST Invoice (జీఎస్టీ)", value: "GST Invoice" },
          { label: "Quotation (కొటేషన్)", value: "Quotation" },
          { label: "Cash Memo (క్యాష్ మెమో)", value: "Cash Memo" },
        ];
      case "COLLECTING_CUSTOMER_ADDR":
      case "COLLECTING_ITEM_QTY":
        return [{ label: "Skip (దాటవేయి)", value: "Skip" }];
      case "COLLECTING_ITEM_NAME":
        if (contextData.rows && contextData.rows.length > 0) {
          return [{ label: "Finish (అయిపోయింది)", value: "Finish" }];
        }
        return [];
      case "CONFIRMING_TAX":
        return [
          { label: "Yes, Apply GST (అవును)", value: "Yes" },
          { label: "No (వద్దు)", value: "No" },
        ];
      case "SUMMARY_REVIEW":
        return [
          { label: "Generate Invoice (అవును)", value: "Yes" },
          { label: "Cancel (వద్దు)", value: "Cancel" },
        ];
      case "CLARIFYING_PRODUCT_SUGGESTION":
        if (contextData && contextData.productSuggestions) {
          return contextData.productSuggestions.map((s: string, idx: number) => ({
            label: `${idx + 1}. ${s}`,
            value: String(idx + 1),
          }));
        }
        return [];
      case "CONFIRMING_DESTRUCTIVE":
        return [
          { label: "Yes, reset/cancel (అవును)", value: "Yes" },
          { label: "No (వద్దు)", value: "No" },
        ];
      default:
        return [];
    }
  };

  const pills = getPillsForState();

  return (
    <div
      style={{
        position: "fixed",
        top: 0,
        right: 0,
        width: "100%",
        maxWidth: "420px",
        height: "100vh",
        backgroundColor: "var(--color-background-primary, #fff)",
        borderLeft: "1px solid var(--color-border-secondary, #cbd5e1)",
        boxShadow: "-10px 0 25px -5px rgba(15, 23, 42, 0.15)",
        display: "flex",
        flexDirection: "column",
        zIndex: 999,
        animation: "slideInRight 0.25s ease-out",
        boxSizing: "border-box",
      }}
    >
      {/* Header */}
      <div
        style={{
          padding: "14px 16px",
          borderBottom: "1px solid var(--color-border-tertiary, #e2e8f0)",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          backgroundColor: "#f8fafc",
        }}
      >
        <div>
          <h3 style={{ fontSize: "14px", fontWeight: 600, color: "#003399", margin: 0 }}>
            AI Billing Assistant
          </h3>
          <span style={{ fontSize: "10px", color: "var(--color-text-secondary)" }}>
            State: {currentState.replace("COLLECTING_", "").replace("_", " ")}
          </span>
        </div>
        <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
          <select
            value={language}
            onChange={(e) => onLanguageChange(e.target.value)}
            style={{
              padding: "4px 8px",
              fontSize: "11px",
              borderRadius: "4px",
              border: "1px solid var(--color-border-secondary)",
              background: "#fff",
              cursor: "pointer",
            }}
          >
            <option value="te-IN">తెలుగు (Telugu)</option>
            <option value="en-IN">English (India)</option>
          </select>
          <button
            onClick={onClose}
            style={{
              background: "none",
              border: "none",
              cursor: "pointer",
              fontSize: "20px",
              color: "var(--color-text-secondary)",
              padding: "2px 6px",
            }}
          >
            &times;
          </button>
        </div>
      </div>

      {/* Compatibility Banner */}
      {!isSpeechSupported && (
        <div
          style={{
            backgroundColor: "#fef2f2",
            color: "#991b1b",
            padding: "8px 12px",
            fontSize: "11px",
            borderBottom: "1px solid #fee2e2",
            display: "flex",
            gap: "6px",
            alignItems: "center",
            fontWeight: 500,
          }}
        >
          <span style={{ fontSize: "14px" }}>⚠️</span>
          <span>
            {language === "te-IN"
              ? "ఈ బ్రౌజర్‌లో వాయిస్ ఇన్‌పుట్ అందుబాటులో లేదు. దయచేసి టైప్ చేయండి."
              : "Voice input is not supported in this browser. Please type."}
          </span>
        </div>
      )}

      {/* Speech Error Banner */}
      {speechError && (
        <div
          style={{
            backgroundColor: "#fffbeb",
            color: "#92400e",
            padding: "8px 12px",
            fontSize: "11px",
            borderBottom: "1px solid #fef3c7",
            display: "flex",
            gap: "6px",
            alignItems: "center",
            fontWeight: 500,
          }}
        >
          <span style={{ fontSize: "14px" }}>⚠️</span>
          <span>
            {language === "te-IN"
              ? `మైక్రోఫోన్ కనెక్షన్ విఫలమైంది (${speechError}). దయచేసి టైప్ చేయండి.`
              : `Microphone access failed (${speechError}). Please type.`}
          </span>
        </div>
      )}

      {/* Messages Panel */}
      <div
        style={{
          flex: 1,
          padding: "16px",
          overflowY: "auto",
          display: "flex",
          flexDirection: "column",
          gap: "12px",
          backgroundColor: "#f1f5f9",
        }}
      >
        {messages.map((msg, index) => (
          <div
            key={index}
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: msg.sender === "ai" ? "flex-start" : "flex-end",
              maxWidth: "85%",
              alignSelf: msg.sender === "ai" ? "flex-start" : "flex-end",
            }}
          >
            <div
              style={{
                padding: "10px 12px",
                borderRadius: msg.sender === "ai" ? "12px 12px 12px 2px" : "12px 12px 2px 12px",
                backgroundColor: msg.sender === "ai" ? "#ffffff" : "#003399",
                color: msg.sender === "ai" ? "var(--color-text-primary)" : "#ffffff",
                fontSize: "13px",
                border: msg.sender === "ai" ? "1px solid #e2e8f0" : "none",
                boxShadow: "0 1px 3px rgba(0,0,0,0.05)",
                lineHeight: "1.4",
              }}
            >
              {msg.sender === "ai" && msg.teText && (
                <div style={{ color: "#d97706", fontWeight: 500, borderBottom: "1px dashed #e2e8f0", paddingBottom: "4px", marginBottom: "4px" }}>
                  {msg.teText}
                </div>
              )}
              <div>{msg.text}</div>
            </div>
            <span style={{ fontSize: "9px", color: "#888", marginTop: "3px", alignSelf: msg.sender === "ai" ? "flex-start" : "flex-end" }}>
              {msg.timestamp}
            </span>
          </div>
        ))}

        {/* AI parsing loading bubble */}
        {isParsing && (
          <div style={{ alignSelf: "flex-start", display: "flex", gap: "4px", padding: "10px 14px", backgroundColor: "#fff", border: "1px solid #e2e8f0", borderRadius: "12px", boxShadow: "0 1px 3px rgba(0,0,0,0.05)" }}>
            <span style={{ height: "6px", width: "6px", backgroundColor: "#003399", borderRadius: "9999px", animation: "ping 1s infinite" }} />
            <span style={{ height: "6px", width: "6px", backgroundColor: "#003399", borderRadius: "9999px", animation: "ping 1s infinite 0.2s" }} />
            <span style={{ height: "6px", width: "6px", backgroundColor: "#003399", borderRadius: "9999px", animation: "ping 1s infinite 0.4s" }} />
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Interactive Summary Review Box (When SUMMARY_REVIEW state) */}
      {currentState === "SUMMARY_REVIEW" && contextData && (
        <div
          style={{
            padding: "12px 16px",
            borderTop: "1px solid var(--color-border-tertiary)",
            backgroundColor: "#fff8eb",
            borderBottom: "1px solid var(--color-border-tertiary)",
            fontSize: "12px",
            maxHeight: "220px",
            overflowY: "auto",
          }}
        >
          <strong style={{ color: "#c2410c", display: "block", marginBottom: "6px" }}>
            Review Extracted Invoice (సారాంశం):
          </strong>
          <div style={{ marginBottom: "6px" }}>
            <strong>Doc Type:</strong> {contextData.btype?.toUpperCase()}
          </div>
          <div style={{ marginBottom: "4px" }}>
            <strong>Customer:</strong> {contextData.cname || "—"}
          </div>
          {contextData.caddr && (
            <div style={{ marginBottom: "4px" }}>
              <strong>Address:</strong> {contextData.caddr}
            </div>
          )}
          <div style={{ marginTop: "8px", borderTop: "1px dashed #e2e8f0", paddingTop: "6px" }}>
            <strong style={{ display: "block", marginBottom: "4px" }}>Items:</strong>
            {contextData.rows?.map((row: any, idx: number) => (
              <div
                key={idx}
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  padding: "2px 0",
                  borderBottom: "1px solid #fff3e0",
                }}
              >
                <span>
                  {idx + 1}. {row.p} ({row.q} units)
                </span>
                <span>Rs.{(parseFloat(row.q) * parseFloat(row.r) || 0).toLocaleString("en-IN")}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Suggestion pills container */}
      {pills.length > 0 && (
        <div
          style={{
            padding: "8px 12px 2px",
            display: "flex",
            flexWrap: "wrap",
            gap: "6px",
            backgroundColor: "#f8fafc",
            borderTop: "1px solid var(--color-border-tertiary)",
          }}
        >
          {pills.map((p: any, idx: number) => (
            <button
              key={idx}
              type="button"
              onClick={() => handlePillClick(p.value)}
              className="btn btn-sm btn-blue"
              style={{
                borderRadius: "9999px",
                padding: "4px 10px",
                fontSize: "11px",
                backgroundColor: "#e0f2fe",
                color: "#0369a1",
                borderColor: "#bae6fd",
                fontWeight: 500,
                boxShadow: "0 1px 2px rgba(0,0,0,0.02)",
              }}
            >
              {p.label}
            </button>
          ))}
        </div>
      )}

      {/* Input Tray */}
      <div
        style={{
          padding: "12px 16px",
          borderTop: "1px solid var(--color-border-tertiary)",
          backgroundColor: "#f8fafc",
          display: "flex",
          alignItems: "center",
          gap: "8px",
        }}
      >
        <button
          type="button"
          onClick={onMicClick}
          disabled={isParsing || !isSpeechSupported}
          style={{
            width: "44px",
            height: "44px",
            borderRadius: "50%",
            backgroundColor: !isSpeechSupported ? "#94a3b8" : isListening ? "#ef4444" : "#003399",
            color: "#ffffff",
            border: "none",
            cursor: !isSpeechSupported ? "not-allowed" : "pointer",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            boxShadow: isListening ? "0 0 12px rgba(239, 68, 68, 0.4)" : "none",
            transition: "all 0.2s ease",
            flexShrink: 0,
          }}
          title={
            !isSpeechSupported
              ? "Voice input not supported"
              : isListening
              ? "Listening... click to stop"
              : "Speak invoice details"
          }
        >
          {isListening ? (
            <div style={{ display: "flex", alignItems: "center", gap: "2px" }}>
              <span className="wave-bar" style={{ display: "inline-block", width: "3px", height: "16px", backgroundColor: "#fff", borderRadius: "2px", animation: "waveMotion 0.6s infinite ease-in-out" }} />
              <span className="wave-bar" style={{ display: "inline-block", width: "3px", height: "24px", backgroundColor: "#fff", borderRadius: "2px", animation: "waveMotion 0.6s infinite ease-in-out 0.15s" }} />
              <span className="wave-bar" style={{ display: "inline-block", width: "3px", height: "16px", backgroundColor: "#fff", borderRadius: "2px", animation: "waveMotion 0.6s infinite ease-in-out 0.3s" }} />
            </div>
          ) : (
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="20"
              height="20"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth="2.5"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z"
              />
            </svg>
          )}
        </button>

        <form onSubmit={handleSendText} style={{ flex: 1, display: "flex", gap: "6px" }}>
          <input
            type="text"
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            disabled={isParsing || isListening}
            placeholder={isListening ? "Listening to your voice..." : "Type details or speak..."}
            style={{
              flex: 1,
              padding: "10px 12px",
              borderRadius: "8px",
              border: "1px solid var(--color-border-secondary)",
              fontSize: "13px",
              outline: "none",
              backgroundColor: isListening ? "#f1f5f9" : "#fff",
            }}
          />
          <button
            type="submit"
            disabled={!inputText.trim() || isParsing || isListening}
            className="btn btn-blue"
            style={{
              padding: "0 14px",
              borderRadius: "8px",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              cursor: "pointer",
            }}
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="16"
              height="16"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth="2"
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M14 5l7 7m0 0l-7 7m7-7H3" />
            </svg>
          </button>
        </form>
      </div>

      {/* Control row */}
      <div
        style={{
          padding: "8px 16px",
          borderTop: "1px solid var(--color-border-tertiary)",
          display: "flex",
          justifyContent: "space-between",
          backgroundColor: "#f8fafc",
          fontSize: "11px",
        }}
      >
        <button
          type="button"
          onClick={onReset}
          style={{
            background: "none",
            border: "none",
            color: "#ef4444",
            cursor: "pointer",
            fontWeight: 500,
          }}
        >
          Reset FSM (రీసెట్)
        </button>
        <span style={{ color: "var(--color-text-secondary)" }}>SVS Billing Conversational Assistant</span>
      </div>

      <style jsx global>{`
        @keyframes slideInRight {
          from {
            transform: translateX(100%);
          }
          to {
            transform: translateX(0);
          }
        }
        @keyframes waveMotion {
          0%, 100% {
            transform: scaleY(0.4);
          }
          50% {
            transform: scaleY(1.1);
          }
        }
      `}</style>
    </div>
  );
}
