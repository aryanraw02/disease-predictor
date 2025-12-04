// src/pages/Predictor.jsx
import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import Select from "react-select";
import api from "../api";
import Footer from "../components/Footer";
import predictorImg from "../img/diseasepredictor.svg";

export default function Predictor() {
  const navigate = useNavigate();
  const [symptomsList, setSymptomsList] = useState([]);
  const [selectValue, setSelectValue] = useState(null);
  const [selectedSymptoms, setSelectedSymptoms] = useState(() => {
    try {
      const saved = localStorage.getItem("selectedSymptoms");
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });
  const [selectedSubMap, setSelectedSubMap] = useState(() => {
    try {
      const saved = localStorage.getItem("selectedSubMap");
      return saved ? JSON.parse(saved) : {};
    } catch {
      return {};
    }
  });
  const [predictions, setPredictions] = useState(() => {
    try {
      const saved = localStorage.getItem("predictions");
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });
  const [loading, setLoading] = useState(false);

  // subsym data: { SymptomName: [sub1, sub2, ...] }
  const [subsymMap, setSubsymMap] = useState({});
  // UI: modal state
  const [openSubModalFor, setOpenSubModalFor] = useState(null);

  useEffect(() => {
    async function load() {
      try {
        const res = await api.get("/symptoms/");
        const opts = (res.data || []).map((s) => ({
          value: s.name,
          label: prettifyName(s.name),
        }));
        setSymptomsList(opts);
      } catch (err) {
        console.error("Failed to load symptoms", err);
        setSymptomsList([]);
      }

      // load subsymptoms JSON
      try {
        const r2 = await api.get("/subsymptoms/");
        setSubsymMap(r2.data || {});
      } catch (err) {
        // fallback: empty map
        console.warn(
          "Failed to load subsymptoms, continuing without them",
          err
        );
        setSubsymMap({});
      }
    }
    load();
  }, []);

  useEffect(() => {
    localStorage.setItem("selectedSymptoms", JSON.stringify(selectedSymptoms));
  }, [selectedSymptoms]);

  useEffect(() => {
    localStorage.setItem("selectedSubMap", JSON.stringify(selectedSubMap));
  }, [selectedSubMap]);

  useEffect(() => {
    localStorage.setItem("predictions", JSON.stringify(predictions));
  }, [predictions]);

  function prettifyName(name) {
    if (!name) return "";
    return name
      .toString()
      .replace(/_/g, " ")
      .split(" ")
      .map((w) => (w ? w[0].toUpperCase() + w.slice(1) : ""))
      .join(" ");
  }

  function addSymptom() {
    if (!selectValue) return;
    const val = selectValue.value;
    if (!selectedSymptoms.some((s) => s.toLowerCase() === val.toLowerCase())) {
      setSelectedSymptoms((prev) => [...prev, val]);
      // open modal to select subs (if mapping exists)
      if (subsymMap && subsymMap[val] && subsymMap[val].length > 0) {
        setOpenSubModalFor(val);
        // initialize selected sub map entry
        setSelectedSubMap((prev) => ({ ...prev, [val]: prev[val] || [] }));
      } else {
        // no subs defined - still ensure map has empty entry
        setSelectedSubMap((prev) => ({ ...prev, [val]: prev[val] || [] }));
      }
    }
    setSelectValue(null);
  }

  function removeSymptom(val) {
    setSelectedSymptoms((prev) => prev.filter((s) => s !== val));
    setSelectedSubMap((prev) => {
      const copy = { ...prev };
      delete copy[val];
      return copy;
    });
    setPredictions([]); // Clear predictions only when symptoms change
    localStorage.removeItem("predictions");
  }

  async function handlePredict() {
    if (selectedSymptoms.length === 0) {
      alert("Add at least one symptom.");
      return;
    }
    setLoading(true);
    // Do not clear predictions here
    try {
      const payload = { symptoms: selectedSymptoms, sub_map: selectedSubMap };
      const res = await api.post("/predict/", payload);
      const data = res.data || {};
      let preds = [];
      if (data.predictions) {
        preds = data.predictions;
      } else if (data.predictions === undefined && data.top) {
        preds = data.top;
      }
      setPredictions(preds);
      localStorage.setItem("predictions", JSON.stringify(preds));
      if (data.emergency) {
        // Show alert with option to consult
        const shouldConsult = window.confirm(
          "⚠️ Emergency signs detected — please consult a doctor immediately.\n\nWould you like to book a consultation now?"
        );
        if (shouldConsult) {
          navigate("/consult");
        }
      }
    } catch (err) {
      console.error("Prediction failed", err);
      alert("Prediction failed — check backend logs.");
    } finally {
      setLoading(false);
    }
  }

  function clearAll() {
    setSelectedSymptoms([]);
    setSelectedSubMap({});
    setPredictions([]);
    localStorage.removeItem("selectedSymptoms");
    localStorage.removeItem("selectedSubMap");
    localStorage.removeItem("predictions");
  }

  // submodal helpers
  function toggleSub(sym, sub) {
    setSelectedSubMap((prev) => {
      const arr = new Set(prev[sym] || []);
      if (arr.has(sub)) arr.delete(sub);
      else arr.add(sub);
      return { ...prev, [sym]: Array.from(arr) };
    });
  }

  function closeSubModal() {
    setOpenSubModalFor(null);
  }

  const customStyles = {
    control: (provided, state) => ({
      ...provided,
      minHeight: 56,
      borderRadius: 16,
      borderWidth: 2,
      borderColor: state.isFocused ? "#9333ea" : "#e9d5ff",
      boxShadow: state.isFocused ? "0 0 0 4px rgba(147,51,234,0.1)" : "none",
      backgroundColor: "rgba(255,255,255,0.9)",
      backdropFilter: "blur(12px)",
      paddingLeft: 16,
      paddingRight: 16,
      transition: "all 0.3s ease",
      "&:hover": {
        borderColor: "#a855f7",
      },
    }),
    placeholder: (provided) => ({
      ...provided,
      color: "#94a3b8",
      fontWeight: 600,
    }),
    input: (provided) => ({
      ...provided,
      color: "#1e293b",
      fontWeight: 500,
    }),
    menu: (provided) => ({
      ...provided,
      backgroundColor: "rgba(255,255,255,0.98)",
      backdropFilter: "blur(20px)",
      borderRadius: 16,
      boxShadow: "0 20px 60px rgba(147,51,234,0.2)",
      border: "2px solid rgba(167,139,250,0.3)",
      marginTop: 10,
      overflow: "hidden",
      zIndex: 9999,
    }),
    menuPortal: (base) => ({
      ...base,
      zIndex: 9999,
    }),
    menuList: (provided) => ({
      ...provided,
      padding: 0,
      maxHeight: 320,
    }),
    option: (provided, state) => ({
      ...provided,
      padding: "14px 18px",
      backgroundColor: state.isFocused
        ? "rgba(147,51,234,0.12)"
        : "transparent",
      color: state.isSelected ? "#7c3aed" : "#1e293b",
      cursor: "pointer",
      fontWeight: state.isFocused ? 600 : 500,
      transition: "all 0.2s ease",
      "&:active": {
        backgroundColor: "rgba(147,51,234,0.2)",
      },
    }),
  };

  return (
    <div className="min-h-screen relative bg-gradient-to-b from-slate-50 to-white">
      {/* Enhanced Background */}
      <div className="absolute inset-0 -z-10 overflow-hidden">
        <div
          className="absolute top-20 right-0 w-[700px] h-[700px] bg-gradient-to-br from-purple-300/40 via-pink-300/30 to-blue-300/20 rounded-full blur-3xl"
          style={{
            animation: "pulse 4s cubic-bezier(0.4, 0, 0.6, 1) infinite",
          }}
        />
        <div
          className="absolute bottom-0 left-0 w-[600px] h-[600px] bg-gradient-to-tr from-blue-300/40 via-cyan-300/30 to-emerald-300/20 rounded-full blur-3xl"
          style={{
            animation: "pulse 4s cubic-bezier(0.4, 0, 0.6, 1) infinite",
            animationDelay: "2s",
          }}
        />
        <div className="absolute top-1/2 left-1/2 w-[500px] h-[500px] bg-gradient-to-br from-indigo-200/20 to-purple-200/10 rounded-full blur-3xl" />
      </div>

      <div className="max-w-[1280px] mx-auto px-6 sm:px-8 pt-28 sm:pt-32 pb-20 relative z-10">
        {/* Enhanced Header - Remove animation class */}
        <div className="text-center mb-16">
          <div className="inline-block mb-6 px-6 py-3 bg-gradient-to-r from-purple-100 via-pink-100 to-blue-100 rounded-full shadow-lg">
            <span className="text-sm font-bold bg-gradient-to-r from-purple-600 via-pink-600 to-blue-600 bg-clip-text text-transparent">
              🔬 ML-Powered Medical Diagnosis
            </span>
          </div>

          <h1 className="text-5xl lg:text-6xl font-extrabold mb-6 bg-gradient-to-r from-purple-600 via-pink-600 to-blue-600 bg-clip-text text-transparent leading-tight">
            Disease Predictor
          </h1>

          <p className="text-slate-600 text-xl max-w-3xl mx-auto leading-relaxed">
            Enter your symptoms and get instant ML-powered health predictions.
            <span className="block mt-2 text-lg text-slate-500">
              Select detailed sub-symptoms for more accurate results.
            </span>
          </p>
        </div>

        {/* Enhanced Symptom Input Section - Ensure proper z-index */}
        <div className="max-w-4xl mx-auto mb-12 relative z-20">
          <div className="bg-white/90 backdrop-blur-xl rounded-3xl p-6 sm:p-10 border-2 border-purple-200/60 shadow-2xl hover:shadow-purple-300/40 transition-all duration-300">
            <label className="block text-base font-bold text-slate-800 mb-4 flex items-center gap-2">
              <span className="text-2xl">🩺</span>
              <span className="bg-gradient-to-r from-purple-600 to-pink-600 bg-clip-text text-transparent">
                Select Your Symptoms
              </span>
            </label>

            <div className="flex flex-col sm:flex-row gap-4">
              <div className="flex-1 relative z-30">
                <Select
                  value={selectValue}
                  onChange={(val) => setSelectValue(val)}
                  options={symptomsList}
                  styles={customStyles}
                  placeholder="🔍 Search and select symptoms..."
                  menuPortalTarget={document.body}
                  menuPlacement="auto"
                  menuPosition="fixed"
                  maxMenuHeight={300}
                  isClearable
                  classNamePrefix="react-select"
                  openMenuOnFocus={true}
                  blurInputOnSelect={false}
                />
              </div>

              <button
                onClick={addSymptom}
                disabled={!selectValue}
                className="px-8 py-3 rounded-xl bg-gradient-to-r from-purple-600 via-pink-600 to-blue-600 text-white font-bold hover:shadow-2xl hover:scale-105 transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed disabled:scale-100"
              >
                Add
              </button>
            </div>
          </div>
        </div>

        {/* Enhanced Predictor Cards with better visual hierarchy */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 lg:gap-8 mb-16">
          {/* Enhanced Your Symptoms Card */}
          <div className="bg-white/90 backdrop-blur-xl rounded-3xl p-6 sm:p-8 border-2 border-emerald-200/60 shadow-2xl hover:shadow-emerald-300/40 transition-all duration-300">
            <h2 className="text-xl sm:text-2xl font-bold mb-6 bg-gradient-to-r from-emerald-600 to-green-600 bg-clip-text text-transparent flex items-center gap-2">
              <span className="text-3xl">📋</span>
              Your Symptoms
            </h2>

            <div className="h-[280px] sm:h-[320px] bg-gradient-to-br from-emerald-50 via-green-50 to-teal-50 p-4 sm:p-6 rounded-2xl overflow-auto border-2 border-emerald-200/60 shadow-inner custom-scrollbar">
              {selectedSymptoms.length === 0 ? (
                <div className="h-full flex items-center justify-center">
                  <div className="text-center">
                    <div className="text-6xl mb-4 animate-bounce">🩺</div>
                    <p className="text-slate-600 font-semibold text-lg">
                      No symptoms added yet
                    </p>
                    <p className="text-sm text-slate-400 mt-2">
                      Add your first symptom above to begin
                    </p>
                  </div>
                </div>
              ) : (
                <div className="flex flex-wrap gap-3">
                  {selectedSymptoms.map((s) => (
                    <div
                      key={s}
                      className="group bg-white border-2 border-emerald-300 px-5 py-3 rounded-xl inline-flex items-center gap-3 hover:shadow-xl hover:scale-105 hover:border-emerald-400 transition-all duration-300"
                    >
                      <div className="flex flex-col">
                        <span className="text-sm font-bold text-slate-800">
                          {prettifyName(s)}
                        </span>
                        {(selectedSubMap[s] || []).length > 0 && (
                          <span className="text-xs text-emerald-600 font-medium mt-1">
                            +{(selectedSubMap[s] || []).length} sub-symptoms
                          </span>
                        )}
                      </div>

                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => setOpenSubModalFor(s)}
                          title="Edit sub-symptoms"
                          className="text-lg text-emerald-600 hover:text-emerald-700 hover:scale-125 transition-all"
                        >
                          ✎
                        </button>

                        <button
                          onClick={() => removeSymptom(s)}
                          className="text-emerald-600 hover:text-red-600 font-bold text-lg hover:scale-125 transition-all"
                          aria-label={`Remove ${s}`}
                        >
                          ✕
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="mt-6 flex flex-col sm:flex-row gap-3 sm:gap-4">
              <button
                onClick={handlePredict}
                disabled={loading || selectedSymptoms.length === 0}
                className="flex-1 px-8 py-4 rounded-xl bg-gradient-to-r from-emerald-600 to-green-600 text-white font-bold text-lg hover:shadow-2xl hover:scale-105 transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed disabled:scale-100"
              >
                {loading ? (
                  <span className="flex items-center justify-center gap-2">
                    <span className="animate-spin">⚙️</span> Analyzing...
                  </span>
                ) : (
                  "🔍 Predict Disease"
                )}
              </button>

              <button
                onClick={clearAll}
                disabled={selectedSymptoms.length === 0}
                className="px-8 py-4 rounded-xl border-2 border-red-300 bg-white text-red-600 font-bold text-lg hover:bg-red-50 hover:shadow-xl hover:scale-105 transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed disabled:scale-100"
              >
                🗑️ Clear All
              </button>
            </div>
          </div>

          {/* Enhanced Predicted Results Card */}
          <div className="bg-white/90 backdrop-blur-xl rounded-3xl p-6 sm:p-8 border-2 border-blue-200/60 shadow-2xl hover:shadow-blue-300/40 transition-all duration-300">
            <h2 className="text-xl sm:text-2xl font-bold mb-6 bg-gradient-to-r from-blue-600 to-cyan-600 bg-clip-text text-transparent flex items-center gap-2">
              <span className="text-3xl">📊</span>
              Predicted Results
            </h2>

            <div className="h-[280px] sm:h-[320px] bg-gradient-to-br from-blue-50 via-cyan-50 to-indigo-50 p-4 sm:p-6 rounded-2xl overflow-auto border-2 border-blue-200/60 shadow-inner custom-scrollbar">
              {predictions.length === 0 ? (
                <div className="h-full flex items-center justify-center">
                  <div className="text-center">
                    <div className="text-6xl mb-4 animate-pulse">📊</div>
                    <p className="text-slate-600 font-semibold text-lg">
                      No predictions yet
                    </p>
                    <p className="text-sm text-slate-400 mt-2">
                      Add symptoms and click predict to see results
                    </p>
                  </div>
                </div>
              ) : (
                <div className="space-y-4">
                  {predictions.map((p, i) => (
                    <div
                      key={i}
                      className="flex flex-col gap-3 bg-white border-2 border-blue-300 px-6 py-5 rounded-2xl hover:shadow-xl hover:scale-[1.02] transition-all duration-300"
                    >
                      <div className="flex justify-between items-center">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-full bg-gradient-to-br from-blue-500 to-cyan-500 flex items-center justify-center text-white font-bold shadow-lg">
                            {i + 1}
                          </div>
                          <span className="font-bold text-slate-800 text-lg">
                            {prettifyName(p.disease)}
                          </span>
                        </div>
                        <div className="px-5 py-2.5 bg-gradient-to-r from-blue-100 to-cyan-100 rounded-xl border-2 border-blue-300 shadow-md">
                          <span className="font-extrabold text-blue-700 text-lg">
                            {((p.prob ?? p.probability ?? 0) * 100).toFixed(1)}%
                          </span>
                        </div>
                      </div>

                      <div className="text-sm text-slate-600 space-y-2">
                        {p.tests && p.tests.length > 0 && (
                          <div className="bg-blue-50 px-4 py-2 rounded-lg border border-blue-200">
                            <strong className="text-blue-700">🔬 Tests:</strong>{" "}
                            {p.tests.join(", ")}
                          </div>
                        )}
                        {p.medicines && p.medicines.length > 0 && (
                          <div className="bg-green-50 px-4 py-2 rounded-lg border border-green-200">
                            <strong className="text-green-700">
                              💊 Medicines:
                            </strong>{" "}
                            {p.medicines.join(", ")}
                          </div>
                        )}
                        {p.emergency && (
                          <div className="bg-red-50 px-4 py-2 rounded-lg border-2 border-red-300 text-red-700 font-bold animate-pulse">
                            ⚠️ Emergency: seek immediate medical care
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Enhanced Consult Doctor Button */}
            {predictions.length > 0 && (
              <div className="mt-6 space-y-4">
                <button
                  onClick={() => navigate("/consult")}
                  className="w-full px-6 sm:px-8 py-4 sm:py-5 rounded-xl bg-gradient-to-r from-purple-600 via-pink-600 to-red-600 text-white font-bold text-base sm:text-lg hover:shadow-2xl hover:scale-[1.02] active:scale-[0.98] transition-all duration-300 flex items-center justify-center gap-3 group"
                >
                  <span className="text-xl sm:text-2xl group-hover:scale-110 transition-transform">
                    👨‍⚕️
                  </span>
                  Consult a Doctor Now
                  <span className="text-lg sm:text-xl group-hover:translate-x-1 transition-transform">
                    →
                  </span>
                </button>

                <div className="text-center">
                  <div className="inline-block px-4 sm:px-6 py-2.5 sm:py-3 bg-gradient-to-r from-yellow-100 to-orange-100 rounded-xl border-2 border-yellow-300/70 shadow-lg">
                    <span className="text-xs sm:text-sm font-bold bg-gradient-to-r from-yellow-600 to-orange-600 bg-clip-text text-transparent">
                      ⚠️ Always consult a doctor for confirmation
                    </span>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Enhanced About Section with better image integration */}
        <section className="relative py-20 overflow-hidden">
          <div className="absolute inset-0 -z-10">
            <div
              className="absolute top-0 right-0 w-[500px] h-[500px] bg-gradient-to-bl from-purple-300/30 to-pink-300/20 rounded-full blur-3xl"
              style={{ animation: "pulse 6s ease-in-out infinite" }}
            />
          </div>

          <div className="bg-white/90 backdrop-blur-xl rounded-3xl p-12 border-2 border-purple-200/60 shadow-2xl hover:shadow-purple-200/50 transition-all duration-500 hover:scale-[1.01]">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">
              <div className="space-y-6">
                <div className="inline-block px-6 py-3 bg-gradient-to-r from-purple-100 via-pink-100 to-blue-100 rounded-full shadow-lg">
                  <span className="text-sm font-bold bg-gradient-to-r from-purple-600 via-pink-600 to-blue-600 bg-clip-text text-transparent">
                    💡 How It Works
                  </span>
                </div>

                <h3 className="text-4xl lg:text-5xl font-extrabold bg-gradient-to-r from-purple-600 via-pink-600 to-blue-600 bg-clip-text text-transparent leading-tight">
                  About Our Disease Predictor
                </h3>

                <p className="text-slate-600 leading-relaxed text-lg">
                  Introducing our advanced ML-powered disease predictor, a
                  revolutionary tool designed to simplify healthcare for you.
                  Get instant predictions with detailed recommendations for
                  tests and medicines.
                </p>

                <div className="flex gap-4 pt-4">
                  <div className="flex-1 bg-gradient-to-br from-purple-50 to-pink-50 p-6 rounded-2xl border-2 border-purple-200 shadow-lg hover:shadow-xl hover:scale-105 transition-all duration-500">
                    <div className="text-3xl mb-2">🤖</div>
                    <h4 className="font-bold text-slate-800 mb-1">
                      ML Powered
                    </h4>
                    <p className="text-sm text-slate-600">
                      Advanced machine learning algorithms
                    </p>
                  </div>
                  <div className="flex-1 bg-gradient-to-br from-blue-50 to-cyan-50 p-6 rounded-2xl border-2 border-blue-200 shadow-lg hover:shadow-xl hover:scale-105 transition-all duration-500">
                    <div className="text-3xl mb-2">⚡</div>
                    <h4 className="font-bold text-slate-800 mb-1">
                      Instant Results
                    </h4>
                    <p className="text-sm text-slate-600">
                      Get predictions in seconds
                    </p>
                  </div>
                </div>
              </div>

              <div className="flex justify-center lg:justify-end">
                <div className="relative group">
                  <div className="absolute inset-0 bg-gradient-to-br from-purple-400/30 via-pink-400/30 to-blue-400/20 rounded-full blur-3xl -z-10 opacity-0 group-hover:opacity-100 transition-opacity duration-700" />
                  <div className="absolute inset-0 bg-gradient-to-br from-purple-300/20 to-pink-300/20 rounded-full blur-2xl -z-10 animate-pulse" />
                  <img
                    src={predictorImg}
                    alt="Predictor illustration"
                    className="max-w-[420px] w-full object-contain drop-shadow-2xl transform hover:scale-110 transition-all duration-700 ease-out filter hover:contrast-110 hover:saturate-110 hover:drop-shadow-[0_35px_100px_rgba(147,51,234,0.4)]"
                    style={{
                      mixBlendMode: "normal",
                      isolation: "isolate",
                    }}
                  />
                </div>
              </div>
            </div>
          </div>
        </section>
      </div>

      <Footer />

      {/* Enhanced Sub-symptom Modal with smooth animations */}
      {openSubModalFor && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-fadeIn">
          <div
            className="bg-white rounded-2xl sm:rounded-3xl p-6 sm:p-8 w-full max-w-2xl shadow-2xl border-2 border-purple-200 max-h-[90vh] flex flex-col transform transition-all duration-500 scale-100 hover:scale-[1.01]"
            style={{
              animation: "scaleIn 0.3s cubic-bezier(0.34, 1.56, 0.64, 1)",
            }}
          >
            <div className="flex justify-between items-start mb-6">
              <h3 className="text-lg sm:text-xl font-bold bg-gradient-to-r from-purple-600 to-pink-600 bg-clip-text text-transparent pr-4">
                Select sub-symptoms for {prettifyName(openSubModalFor)}
              </h3>
              <button
                onClick={closeSubModal}
                className="text-gray-400 hover:text-gray-700 text-2xl sm:text-3xl hover:scale-110 hover:rotate-90 transition-all duration-300 flex-shrink-0"
              >
                ✕
              </button>
            </div>

            <div className="grid gap-2.5 sm:gap-3 overflow-auto bg-gradient-to-br from-purple-50 to-pink-50 p-4 sm:p-6 rounded-xl border-2 border-purple-200 custom-scrollbar flex-1">
              {(subsymMap[openSubModalFor] || []).map((sub, index) => {
                const checked = (
                  selectedSubMap[openSubModalFor] || []
                ).includes(sub);
                return (
                  <label
                    key={sub}
                    className="flex items-center gap-4 p-4 rounded-xl hover:bg-white bg-white/50 border-2 border-purple-200/50 hover:border-purple-400 cursor-pointer transition-all duration-300 hover:shadow-lg hover:scale-[1.02]"
                    style={{
                      animation: `fadeInUp 0.3s cubic-bezier(0.4, 0, 0.2, 1) ${
                        index * 0.05
                      }s both`,
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => toggleSub(openSubModalFor, sub)}
                      className="w-5 h-5 accent-purple-600 transition-transform duration-200 hover:scale-110"
                    />
                    <span className="text-sm font-semibold text-slate-700">
                      {sub}
                    </span>
                  </label>
                );
              })}
              {(subsymMap[openSubModalFor] || []).length === 0 && (
                <div className="text-center text-slate-500 py-8">
                  <div className="text-4xl mb-2 animate-bounce">📝</div>
                  No sub-symptoms defined for this symptom.
                </div>
              )}
            </div>

            <div className="mt-6 flex justify-end gap-3">
              <button
                onClick={closeSubModal}
                className="px-6 sm:px-8 py-2.5 sm:py-3 rounded-xl bg-gradient-to-r from-purple-600 to-pink-600 text-white font-bold hover:shadow-xl hover:scale-105 active:scale-95 transition-all duration-300"
              >
                ✓ Done
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Enhanced custom scrollbar and animation styles */}
      <style jsx>{`
        .custom-scrollbar::-webkit-scrollbar {
          width: 8px;
          height: 8px;
        }
        .custom-scrollbar::-webkit-scrollbar-track {
          background: rgba(148, 163, 184, 0.1);
          border-radius: 10px;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb {
          background: linear-gradient(to bottom, #a855f7, #ec4899);
          border-radius: 10px;
          transition: background 0.3s ease;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover {
          background: linear-gradient(to bottom, #9333ea, #db2777);
        }

        @keyframes fadeInUp {
          from {
            opacity: 0;
            transform: translateY(20px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }

        @keyframes scaleIn {
          from {
            opacity: 0;
            transform: scale(0.9);
          }
          to {
            opacity: 1;
            transform: scale(1);
          }
        }

        @keyframes fadeIn {
          from {
            opacity: 0;
          }
          to {
            opacity: 1;
          }
        }
      `}</style>
    </div>
  );
}
