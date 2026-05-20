import React, { useState, useMemo, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Beaker, 
  Settings2, 
  FileCode, 
  Play, 
  ChevronRight, 
  Info,
  Download,
  ClipboardCheck,
  FlaskConical,
  RotateCcw,
  Pause,
  Zap,
  Sliders,
  Eye
} from 'lucide-react';

// --- Constants & Helpers ---

const ROWS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'];
const COLS = Array.from({ length: 12 }, (_, i) => (i + 1).toString());

const WELLS = ROWS.flatMap(row => COLS.map(col => `${row}${col}`));

// Convert well name (e.g. A1) to index (0-95)
const wellToIndex = (well: string) => {
  const row = ROWS.indexOf(well[0]);
  const col = parseInt(well.substring(1)) - 1;
  return row * 12 + col;
};

// Convert index (0-95) to well name (e.g. A1)
const indexToWell = (index: number) => {
  const row = Math.floor(index / 12);
  const col = (index % 12) + 1;
  return `${ROWS[row]}${col}`;
};

export default function App() {
  const mainRef = useRef<HTMLElement>(null);
  const deckRef = useRef<HTMLDivElement>(null);

  // --- Basic State ---
  const [startWell, setStartWell] = useState('A1');
  const [endWell, setEndWell] = useState('A12');
  const [transferVol, setTransferVol] = useState(100);
  const [mixVol, setMixVol] = useState(50);
  const [mixCount, setMixCount] = useState(3);
  const [showCode, setShowCode] = useState(false);
  const [copied, setCopied] = useState(false);

  // --- View Control State (Chief Scientist Demands) ---
  const [pipetteMode, setPipetteMode] = useState<'glass' | 'physical' | 'laser'>('glass');
  const [pipetteOpacity, setPipetteOpacity] = useState(60); // 10% - 100%

  // --- Animation State ---
  const [isAnimating, setIsAnimating] = useState(false);
  const [currentStep, setCurrentStep] = useState(0); 
  const [currentAction, setCurrentAction] = useState<string>('Ready');

  // --- Path Calculation ---
  const pathIndices = useMemo(() => {
    const start = wellToIndex(startWell);
    const end = wellToIndex(endWell);
    if (start <= end) {
      return Array.from({ length: end - start + 1 }, (_, i) => start + i);
    }
    return [start];
  }, [startWell, endWell]);

  const pathWells = useMemo(() => pathIndices.map(indexToWell), [pathIndices]);

  // --- Animation Control ---
  useEffect(() => {
    let timer: number;
    if (isAnimating) {
      const totalSteps = (pathWells.length - 1) * 3 + 1; 
      
      timer = window.setInterval(() => {
        setCurrentStep((prev) => {
          if (prev >= totalSteps - 1) {
            setIsAnimating(false);
            setCurrentAction('Completed');
            return prev;
          }
          const next = prev + 1;
          
          // Determine Action Text
          const wellIndex = Math.floor(next / 3);
          const subStep = next % 3;
          if (next === 0) setCurrentAction(`Picking up tip...`);
          else if (subStep === 0) setCurrentAction(`Aspirating from ${pathWells[wellIndex]}...`);
          else if (subStep === 1) setCurrentAction(`Transferring to ${pathWells[wellIndex]}...`);
          else setCurrentAction(`Mixing in ${pathWells[wellIndex]} (${mixCount}x)...`);

          return next;
        });
      }, 1000);
    }
    return () => clearInterval(timer);
  }, [isAnimating, pathWells, mixCount]);

  const resetAnimation = () => {
    setIsAnimating(false);
    setCurrentStep(0);
    setCurrentAction('Ready');
  };

  // --- Status Logic ---
  const stepIndex = Math.floor(currentStep / 3);
  const subStep = currentStep % 3;
  
  // Logic: 
  // Substep 0: At Source, Aspirate
  // Substep 1: Move to Dest, Dispense
  // Substep 2: At Dest, Mix
  const activeWell = useMemo(() => {
    if (subStep === 0) return pathWells[stepIndex];
    return pathWells[stepIndex + 1] || pathWells[stepIndex];
  }, [subStep, stepIndex, pathWells]);

  const isAspirating = subStep === 0 && isAnimating;
  const isDispensing = subStep === 1 && isAnimating;
  const isMixing = subStep === 2 && isAnimating;

  // --- Python Protocol Generation ---
  const pythonProtocol = useMemo(() => {
    return `from opentrons import protocol_api

# metadata
metadata = {
    'protocolName': '96孔板倍比稀释 (Serial Dilution)',
    'author': 'Opentrons Designer App',
    'description': '在标准96孔板上进行倍比稀释',
    'apiLevel': '2.13'
}

def run(protocol: protocol_api.ProtocolContext):
    # 实验参数定义
    TRANSFER_VOLUME = ${transferVol}  # 转移体积 (µL)
    MIX_VOLUME = ${mixVol}            # 吹打混匀体积 (µL)
    MIX_REPS = ${mixCount}              # 混匀次数
    
    # 路径设定
    WELLS_TO_USE = ${JSON.stringify(pathWells)}

    # 设备装载
    tiprack = protocol.load_labware('opentrons_96_tiprack_300ul', '1')
    plate = protocol.load_labware('corning_96_wellplate_360ul_flat', '2')
    pipette = protocol.load_instrument('p300_single', 'right', tip_racks=[tiprack])

    protocol.comment('开始倍比稀释流程...')
    pipette.pick_up_tip()

    for i in range(len(WELLS_TO_USE) - 1):
        source = WELLS_TO_USE[i]
        dest = WELLS_TO_USE[i+1]
        
        protocol.comment(f'从 {source} 转移 {TRANSFER_VOLUME}µL 到 {dest}')
        pipette.aspirate(TRANSFER_VOLUME, plate[source])
        pipette.dispense(TRANSFER_VOLUME, plate[dest])
        
        protocol.comment(f'在 {dest} 进行 {MIX_REPS} 次混匀')
        pipette.mix(MIX_REPS, MIX_VOLUME, plate[dest])
        pipette.blow_out(plate[dest].top())

    last_well = WELLS_TO_USE[-1]
    pipette.aspirate(TRANSFER_VOLUME, plate[last_well])
    pipette.drop_tip()
    protocol.comment('实验协议执行完毕！')
`;
  }, [transferVol, mixVol, mixCount, pathWells]);

  const copyToClipboard = () => {
    navigator.clipboard.writeText(pythonProtocol);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // --- Real-time Scientist Terminal Logs computed reactively ---
  const terminalLogs = useMemo(() => {
    const logs: string[] = [];
    logs.push("💾 [SYS] OPENTRONS OT-2 INITIALIZED SUCCESSFULLY.");
    logs.push("🔍 [SYS] Z-AXIS CALIBRATION COMPLETED WITH 0.01MM RESOLUTION.");
    logs.push("📂 [SYS] LOADED TIPRACK (opentrons_96_tiprack_300ul) ON SLOT 1.");
    logs.push("📂 [SYS] LOADED PLATE (corning_96_wellplate_360ul_flat) ON SLOT 2.");

    const maxLogStep = currentStep;
    for (let s = 1; s <= maxLogStep; s++) {
      const wellIndex = Math.floor(s / 3);
      const subStep = s % 3;
      const well = pathWells[wellIndex] || pathWells[0];
      const nextWell = pathWells[wellIndex + 1] || pathWells[wellIndex];

      if (s === 1) {
        logs.push(`🧪 [ARM] pipette.pick_up_tip() -> Slot 1 tiprack A1`);
      } else if (subStep === 0) {
        logs.push(`💧 [ARM] pipette.aspirate(${transferVol}µL, plate['${well}'])`);
      } else if (subStep === 1) {
        logs.push(`📤 [ARM] pipette.dispense(${transferVol}µL, plate['${nextWell}'])`);
      } else if (subStep === 2) {
        logs.push(`🌀 [ARM] pipette.mix(n=${mixCount}, vol=${mixVol}µL, plate['${nextWell}'])`);
      }
    }

    if (currentAction === 'Completed') {
      logs.push(`🗑️ [ARM] pipette.drop_tip() -> Waste bin`);
      logs.push("✅ [SYS] SEQUENCING PREPARATION COMPLETED SUCCESSFULLY.");
    }

    return logs.slice(-4);
  }, [currentStep, pathWells, transferVol, mixVol, mixCount, currentAction]);

  return (
    <div className="min-h-screen bg-slate-900 text-slate-100 font-sans flex flex-col md:flex-row">
      {/* Scientist Side Operations Console */}
      <aside className="w-full md:w-[360px] bg-slate-950 border-r border-slate-800 p-6 flex flex-col gap-6 shadow-2xl z-10 overflow-y-auto">
        <header className="flex items-center gap-3 border-b border-slate-800 pb-4">
          <div className="p-2.5 bg-indigo-600/20 text-indigo-400 rounded-xl border border-indigo-500/30">
            <FlaskConical size={24} />
          </div>
          <div>
            <h1 className="text-lg font-black tracking-tight text-white leading-none">BGI Genomics</h1>
            <p className="text-[10px] text-indigo-400 font-bold uppercase tracking-widest mt-1">NGS ROBOTICS WORKSTATION</p>
          </div>
        </header>

        <div className="space-y-6">
          <section className="space-y-4">
            <div className="flex items-center gap-2 text-slate-400 font-bold text-[10px] uppercase tracking-widest border-b border-slate-800 pb-2">
              <Settings2 size={12} className="text-indigo-400" />
              孔位参数 (Well Positions)
            </div>
            
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <label className="text-[11px] font-bold text-slate-400">起始 Source</label>
                <select 
                  value={startWell}
                  onChange={(e) => {setStartWell(e.target.value); resetAnimation();}}
                  className="w-full bg-slate-900 border border-slate-800 rounded-lg px-2.5 py-2 text-xs font-semibold text-white focus:ring-2 focus:ring-indigo-500 transition-all outline-none"
                >
                  {WELLS.map(w => <option key={w} value={w}>{w}</option>)}
                </select>
              </div>
              <div className="space-y-1.5">
                <label className="text-[11px] font-bold text-slate-400">截止 Daughter</label>
                <select 
                  value={endWell}
                  onChange={(e) => {setEndWell(e.target.value); resetAnimation();}}
                  className="w-full bg-slate-900 border border-slate-800 rounded-lg px-2.5 py-2 text-xs font-semibold text-white focus:ring-2 focus:ring-indigo-500 transition-all outline-none"
                >
                  {WELLS.map(w => <option key={w} value={w}>{w}</option>)}
                </select>
              </div>
            </div>
          </section>

          <section className="space-y-4">
            <div className="flex items-center gap-2 text-slate-400 font-bold text-[10px] uppercase tracking-widest border-b border-slate-800 pb-2">
              <Beaker size={12} className="text-indigo-400" />
              稀释与混匀逻辑 (Dilution Setup)
            </div>
            
            <div className="space-y-5">
              <div className="space-y-2">
                <div className="flex justify-between items-end">
                  <label className="text-[11px] font-bold text-slate-400">转移体积</label>
                  <span className="text-xs font-mono font-bold text-indigo-400 bg-indigo-500/10 border border-indigo-500/20 px-2 py-0.5 rounded-full">{transferVol} µL</span>
                </div>
                <input 
                  type="range" min="1" max="250" step="1"
                  value={transferVol}
                  onChange={(e) => setTransferVol(Number(e.target.value))}
                  className="w-full h-1.5 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-indigo-500"
                />
              </div>

              <div className="space-y-2">
                <div className="flex justify-between items-end">
                  <label className="text-[11px] font-bold text-slate-400">混匀次数</label>
                  <span className="text-xs font-mono font-bold text-indigo-400 bg-indigo-500/10 border border-indigo-500/20 px-2 py-0.5 rounded-full">{mixCount} 次</span>
                </div>
                <input 
                  type="range" min="1" max="10" step="1"
                  value={mixCount}
                  onChange={(e) => setMixCount(Number(e.target.value))}
                  className="w-full h-1.5 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-indigo-500"
                />
              </div>
            </div>
          </section>

          <section className="space-y-4">
            <div className="flex items-center gap-2 text-slate-400 font-bold text-[10px] uppercase tracking-widest border-b border-slate-800 pb-2">
              <Eye size={12} className="text-indigo-400" />
              视图控制 与 避让 (Viewport Setup)
            </div>
            
            <div className="space-y-4">
              <div className="space-y-1.5">
                <label className="text-[11px] font-bold text-slate-400">移液组件样式 (Style Mode)</label>
                <div className="grid grid-cols-3 gap-1 bg-slate-900 border border-slate-800 p-1 rounded-lg">
                  <button
                    onClick={() => setPipetteMode('glass')}
                    className={`py-1.5 text-[10px] font-bold rounded-md transition-all ${
                      pipetteMode === 'glass' 
                        ? 'bg-indigo-600 text-white shadow-sm' 
                        : 'text-slate-400 hover:text-slate-200'
                    }`}
                    title="高亮玻璃透视 (Frosted Glass Translucent Mode)"
                  >
                    透光玻璃
                  </button>
                  <button
                    onClick={() => setPipetteMode('physical')}
                    className={`py-1.5 text-[10px] font-bold rounded-md transition-all ${
                      pipetteMode === 'physical' 
                        ? 'bg-indigo-600 text-white shadow-sm' 
                        : 'text-slate-400 hover:text-slate-200'
                    }`}
                    title="实物三维拟真 (Physical Robotics Mode)"
                  >
                    立体实物
                  </button>
                  <button
                    onClick={() => setPipetteMode('laser')}
                    className={`py-1.5 text-[10px] font-bold rounded-md transition-all ${
                      pipetteMode === 'laser' 
                        ? 'bg-indigo-600 text-white shadow-sm' 
                        : 'text-slate-400 hover:text-slate-200'
                    }`}
                    title="极简激光对齐 (Target Laser Pointer Mode)"
                  >
                    极简对齐
                  </button>
                </div>
              </div>

              <div className="space-y-2">
                <div className="flex justify-between items-end">
                  <label className="text-[11px] font-bold text-slate-400">机械臂透明度 (Opacity)</label>
                  <span className="text-xs font-mono font-bold text-indigo-400 bg-indigo-500/10 border border-indigo-500/20 px-2 py-0.5 rounded-full">
                    {pipetteMode === 'laser' ? '0' : pipetteOpacity}%
                  </span>
                </div>
                <input 
                  type="range" min="10" max="100" step="5"
                  value={pipetteOpacity}
                  onChange={(e) => setPipetteOpacity(Number(e.target.value))}
                  disabled={pipetteMode === 'laser'}
                  className={`w-full h-1.5 rounded-lg appearance-none cursor-pointer ${
                    pipetteMode === 'laser' ? 'bg-slate-800/20 accent-slate-600 cursor-not-allowed' : 'bg-slate-800 accent-indigo-500'
                  }`}
                />
              </div>
            </div>
          </section>

          <div className="grid grid-cols-2 gap-3">
            <button 
              onClick={() => { setIsAnimating(!isAnimating); if (currentAction === 'Completed') resetAnimation(); }}
              className={`py-3 rounded-xl font-bold text-xs transition-all flex items-center justify-center gap-2 shadow-sm border ${
                isAnimating 
                ? "bg-amber-500/20 text-amber-300 hover:bg-amber-500/30 border-amber-500/30" 
                : "bg-indigo-600 text-white hover:bg-indigo-500 border-indigo-500/20 shadow-indigo-950/50"
              }`}
            >
              {isAnimating ? <Pause size={14} /> : <Play size={14} />}
              {isAnimating ? "暂停演示" : (currentAction === 'Completed' ? "重新播放" : "开始演示")}
            </button>
            <button 
              onClick={resetAnimation}
              className="py-3 bg-slate-900 border border-slate-800 text-slate-300 rounded-xl font-bold text-xs hover:bg-slate-800 transition-all flex items-center justify-center gap-2"
            >
              <RotateCcw size={14} />
              重置
            </button>
          </div>

          <button 
            onClick={() => setShowCode(!showCode)}
            className="w-full py-3 bg-slate-800 text-white hover:bg-slate-700 rounded-xl font-bold text-xs shadow-md transition-all flex items-center justify-center gap-2 border border-slate-700/50"
          >
            <FileCode size={16} />
            {showCode ? "返回仿真视图" : "导出 Opentrons Python"}
          </button>
        </div>

        {/* Action Scientist Console Log */}
        <div className="mt-auto pt-4 border-t border-slate-900">
          <div className="bg-slate-950 rounded-xl border border-slate-800/80 p-3.5 font-mono text-[10px] space-y-1.5 shadow-inner">
            <div className="flex items-center justify-between text-slate-400 border-b border-slate-900 pb-1.5 mb-2">
              <span className="font-bold flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-ping" />
                CONSOLE.LOG
              </span>
              <span>CALIBRATED</span>
            </div>
            {terminalLogs.map((log, index) => (
              <div 
                key={index} 
                className={`truncate ${
                  index === terminalLogs.length - 1 ? "text-indigo-400 font-bold" : "text-slate-500"
                }`}
              >
                {log}
              </div>
            ))}
          </div>
        </div>
      </aside>

      {/* Main Laboratory Simulation Deck */}
      <main ref={mainRef} className="flex-1 p-4 md:p-8 relative flex flex-col items-center justify-center overflow-hidden bg-slate-950">
        <AnimatePresence mode="wait">
          {!showCode ? (
            <motion.div 
              key="viz"
              initial={{ opacity: 0, scale: 0.98 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.98 }}
              className="w-full max-w-5xl bg-slate-900/40 rounded-[2.5rem] shadow-2xl p-6 md:p-8 border border-slate-800/80 relative"
            >
              <div className="mb-6 flex flex-col md:flex-row md:items-end justify-between gap-4 border-b border-slate-800/60 pb-5">
                <div className="flex items-center gap-3.5">
                   <div className="p-3 bg-indigo-500/15 rounded-2xl text-indigo-400 border border-indigo-500/20">
                    <FlaskConical size={26} />
                   </div>
                   <div>
                    <h2 className="text-xl font-extrabold text-white tracking-tight flex items-center gap-2">
                      Opentrons OT-2 仿真操作台
                      <span className="text-[9px] bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 px-2 py-0.5 rounded-full font-bold tracking-wider">ACTIVE</span>
                    </h2>
                    <p className="text-slate-400 text-xs font-semibold mt-1">Slot 2 • Corning 96-Well Plate (360µL Flat)</p>
                   </div>
                </div>
                
                <div className="flex gap-4 items-center bg-slate-950/60 px-4 py-2 rounded-xl border border-slate-800">
                  <div className="flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full bg-rose-500 shadow-sm" />
                    <span className="text-[10px] font-bold text-slate-400">母液孔 (Source)</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full bg-indigo-500 shadow-sm" />
                    <span className="text-[10px] font-bold text-slate-400">稀释孔 (Daughter)</span>
                  </div>
                  <div className="h-4 w-[1px] bg-slate-800" />
                  <div className="text-[10px] font-mono font-bold text-slate-500">
                     P300 Single-Channel
                  </div>
                </div>
              </div>

              {/* Physical Microplate Slider and Backing Plate */}
              <div ref={deckRef} className="relative p-6 md:p-8 bg-slate-950/80 rounded-[2rem] border border-slate-800/70 shadow-2xl select-none overflow-hidden">
                
                {/* 100% Mathematically Aligned Flat CSS Grid */}
                <div className="grid grid-cols-[45px_repeat(12,1fr)] gap-y-4 gap-x-2 md:gap-x-4 items-center relative z-10 w-full">
                  {/* Header labels */}
                  <div />
                  {COLS.map(c => (
                    <div key={`header-col-${c}`} className="text-center text-[10px] font-black text-slate-500 font-mono tracking-tighter uppercase select-none">
                      {c}
                    </div>
                  ))}

                  {/* Rows with Perfect Alignment */}
                  {ROWS.flatMap(row => [
                    // Column 1: Row Name Label
                    <div key={`row-label-${row}`} className="text-center text-[11px] font-black text-slate-500 font-mono italic select-none">
                      {row}
                    </div>,
                    
                    // Columns 2 to 13: Wells for this row code
                    ...COLS.map(col => {
                      const wellId = `${row}${col}`;
                      const index = wellToIndex(wellId);
                      const isStart = wellId === startWell;
                      const isEnd = wellId === endWell;
                      const isInPath = pathIndices.includes(index);
                      const pathOrder = pathIndices.indexOf(index);
                      const isActiveWell = activeWell === wellId && isAnimating;

                      return (
                        <div key={wellId} id={`well-${wellId}`} className="relative aspect-square flex items-center justify-center group">
                          {/* Rich Labwell Label Tooltip */}
                          <div className="absolute -top-7 left-1/2 -translate-x-1/2 bg-slate-900 text-slate-100 text-[9px] font-mono px-2.5 py-1 rounded border border-slate-800 shadow-xl opacity-0 group-hover:opacity-100 transition-opacity duration-150 z-50 pointer-events-none whitespace-nowrap tracking-wide select-none">
                            {wellId} : {isStart ? "Source" : (isInPath ? `Daughter Step ${pathOrder + 1}` : "Empty")}
                          </div>

                          <motion.div 
                            animate={{
                              backgroundColor: isStart ? '#f43f5e' : (isInPath ? '#4f46e5' : '#1e293b'),
                              borderColor: isActiveWell ? '#ffffff' : (isStart ? '#fb7185' : (isInPath ? 'rgba(79,70,229,0.3)' : '#334155')),
                              scale: isActiveWell ? [1, 1.45, 1] : 1,
                              boxShadow: isActiveWell 
                                ? '0 0 35px 8px rgba(99,102,241,0.75), inset 0 0 8px rgba(255,255,255,0.4)' 
                                : (isStart || isEnd ? '0 4px 12px rgba(244,63,94,0.3)' : 'none'),
                            }}
                            transition={{ 
                              scale: isActiveWell ? { 
                                repeat: isMixing ? Infinity : 0, 
                                duration: isMixing ? 0.4 : 0.6,
                                ease: "easeInOut"
                              } : { duration: 0.25 },
                              backgroundColor: { duration: 0.3 }
                            }}
                            className={`w-full aspect-square rounded-full border flex items-center justify-center relative cursor-pointer hover:border-slate-400 transition-colors shadow-inner z-10`}
                            onClick={() => {
                              if (!isAnimating) {
                                setEndWell(wellId);
                                resetAnimation();
                              }
                            }}
                          >
                            {isInPath && (
                              <span className={`text-[9.5px] font-black text-white drop-shadow-sm leading-none ${isActiveWell ? 'scale-125' : ''}`}>
                                {pathOrder + 1}
                              </span>
                            )}
                          </motion.div>

                          {/* 3D Well Plate Physical Ridge Depth */}
                          <div className={`absolute inset-0 bg-slate-900/90 rounded-full scale-[1.25] -z-0 border border-slate-800/80 ${isActiveWell ? 'scale-[1.3] border-indigo-500/20' : ''} transition-all duration-300`} />
                        </div>
                      );
                    })
                  ])}
                </div>

                {/* Simulated Pipette Robot Arm (Gantry and Heads nested dynamically in relative viewports) */}
                <AnimatePresence>
                  {isAnimating && (
                    <PipetteRobotHead 
                      targetWell={activeWell} 
                      isAspirating={isAspirating} 
                      isMixing={isMixing} 
                      deckRef={deckRef}
                      pipetteMode={pipetteMode}
                      pipetteOpacity={pipetteOpacity}
                    />
                  )}
                </AnimatePresence>
              </div>

              {/* Workstation bottom specs card */}
              <div className="mt-6 grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="bg-slate-950/40 p-4 rounded-2xl border border-slate-800 flex items-center gap-4">
                  <div className="w-10 h-10 rounded-full bg-slate-900 flex items-center justify-center text-indigo-400 border border-slate-800 font-mono font-bold text-xs">P300</div>
                  <div>
                    <h4 className="text-[10px] font-bold uppercase text-slate-500">移液组件配置</h4>
                    <p className="text-xs font-bold text-slate-300">OT-2 Single Channel</p>
                  </div>
                </div>
                <div className="bg-indigo-600/5 p-4 rounded-2xl border border-indigo-500/10 col-span-2 flex items-center justify-between">
                  <div>
                    <h4 className="text-[10px] font-bold uppercase text-indigo-400">目前执行路径指令</h4>
                    <p className="text-sm font-bold text-slate-100 flex items-center gap-2 mt-0.5">
                       <span className="w-2 h-2 rounded-full bg-indigo-500 animate-pulse" />
                       {currentAction}
                    </p>
                  </div>
                  <div className="text-right">
                     <p className="text-[10px] font-bold text-slate-500 uppercase">当前稀释进度</p>
                     <p className="text-sm font-mono font-bold text-indigo-400">
                        {Math.floor((currentStep / ((pathWells.length - 1) * 3 + 1)) * 100)}%
                     </p>
                  </div>
                </div>
              </div>
            </motion.div>
          ) : (
            <motion.div 
              key="code"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="w-full max-w-4xl h-[80vh] bg-slate-950 rounded-[2.5rem] shadow-2xl overflow-hidden flex flex-col border border-slate-850"
            >
              <div className="p-5 bg-slate-900 flex items-center justify-between border-b border-slate-800/80">
                <div className="flex items-center gap-4">
                  <div className="flex gap-2">
                    <div className="w-3 h-3 rounded-full bg-rose-500 shadow-sm" />
                    <div className="w-3 h-3 rounded-full bg-amber-500 shadow-sm" />
                    <div className="w-3 h-3 rounded-full bg-emerald-500 shadow-sm" />
                  </div>
                  <span className="text-slate-400 text-xs font-mono font-bold tracking-tight">protocol_simulation.py</span>
                </div>
                <div className="flex gap-2">
                  <button 
                    onClick={copyToClipboard}
                    className="flex items-center gap-2 px-5 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-100 rounded-xl text-xs font-bold transition-all active:scale-95 border border-slate-700/50"
                  >
                    {copied ? <ClipboardCheck size={14} className="text-emerald-400" /> : <Download size={14} />}
                    {copied ? "已复制" : "复制代码"}
                  </button>
                  <button 
                    onClick={() => setShowCode(false)}
                    className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-bold transition-all active:scale-95"
                  >
                    返回
                  </button>
                </div>
              </div>
              <div className="flex-1 overflow-auto p-8 font-mono text-[13px] leading-relaxed bg-slate-950 text-emerald-400/90">
                <pre className="whitespace-pre-wrap">
                  <code>{pythonProtocol}</code>
                </pre>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </main>
    </div>
  );
}

function PipetteRobotHead({ 
  targetWell, 
  isAspirating, 
  isMixing, 
  deckRef,
  pipetteMode,
  pipetteOpacity 
}: { 
  targetWell: string; 
  isAspirating: boolean; 
  isMixing: boolean; 
  deckRef: React.RefObject<HTMLDivElement | null>;
  pipetteMode: 'glass' | 'physical' | 'laser';
  pipetteOpacity: number;
}) {
  const [position, setPosition] = useState({ x: 0, y: 0 });

  useEffect(() => {
    const updatePosition = () => {
      const wellEl = document.getElementById(`well-${targetWell}`);
      const container = deckRef.current;
      if (wellEl && container) {
        const rect = wellEl.getBoundingClientRect();
        const containerRect = container.getBoundingClientRect();
        
        // Calculate precise center of the target well relative to deckRef container
        setPosition({
          x: rect.left - containerRect.left + rect.width / 2,
          y: rect.top - containerRect.top + rect.height / 2
        });
      }
    };
    
    updatePosition();
    const interval = setInterval(updatePosition, 16); 
    window.addEventListener('resize', updatePosition);
    return () => {
      window.removeEventListener('resize', updatePosition);
      clearInterval(interval);
    };
  }, [targetWell, deckRef]);

  // Adjust gantry track styles based on view modes
  const isLaser = pipetteMode === 'laser';
  const isGlass = pipetteMode === 'glass';
  const currentOpacityVal = isLaser ? 0 : pipetteOpacity / 100;

  return (
    <>
      {/* Robot Gantry: Y-Axis Line (moves with Pipette Y) */}
      <motion.div 
        animate={{ y: position.y }} 
        transition={{ type: 'spring', stiffness: 95, damping: 22 }}
        className={`absolute left-0 right-0 pointer-events-none transition-colors duration-200 ${
          isLaser 
            ? "h-[1.5px] bg-cyan-400 shadow-[0_0_6px_rgba(34,211,238,0.7)] z-20"
            : isGlass
              ? "h-0.5 bg-indigo-500/20 border-y border-indigo-400/5 shadow-inner z-20"
              : "h-1 bg-gradient-to-b from-slate-700 via-slate-500 to-slate-700 border-y border-slate-600/30 z-20"
        }`}
        style={{ 
          top: 0, 
          transform: 'translateY(-50%)',
          opacity: isLaser ? 0.7 : currentOpacityVal
        }}
      >
        {!isLaser && (
          /* Physical/Glass linear guide groove */
          <div className="absolute inset-x-0 h-0.5 bg-black/40" style={{ top: isGlass ? '0px' : '1px' }} />
        )}
      </motion.div>

      {/* Robot Gantry: X-Axis Line / Bridge (moves with Pipette X) */}
      <motion.div 
        animate={{ x: position.x }} 
        transition={{ type: 'spring', stiffness: 95, damping: 22 }}
        className={`absolute top-0 bottom-0 pointer-events-none flex items-center justify-center transition-all duration-200 ${
          isLaser
            ? "w-[1.5px] bg-cyan-400 shadow-[0_0_6px_rgba(34,211,238,0.7)] z-10"
            : isGlass
              ? "w-3 bg-slate-900/15 border-x border-slate-800/10 shadow-sm z-10"
              : "w-8 bg-slate-900 border-x border-slate-800 pointer-events-none flex items-center justify-center z-10 shadow-2xl"
        }`}
        style={{ 
          left: 0, 
          transform: 'translateX(-50%)',
          opacity: isLaser ? 0.7 : currentOpacityVal
        }}
      >
        {!isLaser && (
          /* Belt axis/wire groove for robotic gantry carriage */
          <div className={`h-full ${isGlass ? 'w-0.5 bg-slate-950/20' : 'w-1.5 bg-slate-950 border-x border-slate-800'}`} />
        )}
      </motion.div>

      <motion.div 
        initial={false}
        animate={{ 
          x: position.x, 
          y: position.y,
        }}
        transition={{ type: 'spring', stiffness: 95, damping: 22 }}
        className="absolute pointer-events-none z-[100] flex flex-col items-center"
        style={{ left: 0, top: 0 }}
      >
        {isLaser ? (
          /* High-Precision Laser Targeting crosshair / ring alignment */
          <div className="relative flex items-center justify-center" style={{ transform: 'translateY(-50%)' }}>
            {/* Pulsing Target Lock indicators */}
            <motion.div 
              animate={{ 
                scale: [1, 1.25, 1],
                borderColor: isMixing ? ['#06b6d4', '#ec4899', '#06b6d4'] : ['#22d3ee', '#4f46e5', '#22d3ee']
              }}
              transition={{ repeat: Infinity, duration: 1.5 }}
              className="absolute w-12 h-12 rounded-full border border-dashed border-cyan-400"
            />
            <motion.div 
              animate={{ rotate: 360 }}
              transition={{ repeat: Infinity, duration: 12, ease: "linear" }}
              className="absolute w-8 h-8 rounded-full border border-cyan-500/35 border-t-cyan-400"
            />
            <div className="absolute w-1.5 h-1.5 rounded-full bg-cyan-400 shadow-[0_0_10px_#22d3ee]" />
            
            {/* Crosshair indicators */}
            <div className="absolute w-5 h-[1.5px] bg-cyan-400/60" />
            <div className="absolute h-5 w-[1.5px] bg-cyan-400/60" />

            {/* Simulated laser path projecting from extreme top */}
            <div className="absolute bottom-[20px] h-96 w-[1.5px] bg-cyan-400/30 shadow-[0_0_8px_rgba(34,211,238,0.5)] origin-bottom animate-pulse" />
          </div>
        ) : (
          /* Physical or Glass mechanical assembly */
          <div 
            className="relative flex flex-col items-center transition-all duration-300" 
            style={{ 
              transform: 'translateY(-100%)',
              opacity: currentOpacityVal
            }}
          >
            {/* Pipette Head Control Block */}
            <div 
              className={`w-12 h-32 rounded-t-2xl flex flex-col items-center transition-all duration-200 ${
                isGlass 
                  ? "bg-gradient-to-br from-slate-900/30 to-slate-950/40 border border-slate-700/30 backdrop-blur-[1px]" 
                  : "bg-gradient-to-br from-slate-800 via-slate-700 to-slate-950 rounded-t-2xl shadow-2xl border border-slate-700"
              }`}
            >
              <div className={`mt-4 w-6 h-6 rounded-full flex items-center justify-center font-bold text-[8px] border transition-colors ${
                isGlass 
                  ? "bg-indigo-500/5 border-indigo-500/20 text-indigo-300"
                  : "bg-indigo-500/25 border border-indigo-500/40 text-indigo-200"
              }`}>
                P300
              </div>
              <div className={`w-1.5 h-10 mt-4 rounded-full border ${isGlass ? "bg-slate-900/10 border-slate-800/10" : "bg-slate-900/80 border-slate-800"}`} />
              <div className={`mt-auto w-full h-4 border-t rounded-b-sm ${isGlass ? "bg-slate-950/20 border-slate-800/20" : "bg-slate-950 border-slate-800"}`} />
            </div>
            
            {/* Plunger Drive Screw */}
            <motion.div 
              animate={{ height: (isAspirating || isMixing) ? 55 : 35 }}
              className={`w-2.5 shadow-inner transition-all duration-200 ${
                isGlass
                  ? "bg-gradient-to-r from-slate-700/20 to-slate-600/10 border-x border-slate-800/10"
                  : "bg-gradient-to-r from-slate-600 via-slate-400 to-slate-600 border-x border-slate-700"
              }`} 
            />
            
            {/* Nozzle Nozzle Connector */}
            <div className={`w-5 h-7 rounded-b-md shadow-xl transition-all duration-200 ${
              isGlass
                ? "bg-slate-950/20 border border-slate-800/20"
                : "bg-slate-900 border border-slate-800"
            }`} />
            
            {/* Transparent Polypropylene Disposable Pipette Tip */}
            <motion.div 
              animate={{ 
                y: (isAspirating || isMixing) ? 8 : 0,
                scaleY: (isAspirating || isMixing) ? 0.96 : 1
              }}
              className="flex flex-col items-center origin-top flex-shrink-0"
            >
              {/* Cone Neck */}
              <div className={`w-3.5 h-3 rounded-t border-x ${
                isGlass 
                  ? "bg-slate-600/20 border-slate-700/10"
                  : "bg-slate-600 border-slate-700"
              }`} />

              {/* Main Pipette Liquid reservoir body (semi-transparent) */}
              <div className={`w-3 h-14 rounded-b-xl relative overflow-hidden flex items-end shadow-sm ${
                isGlass
                  ? "bg-indigo-500/5 border-x border-b border-indigo-400/20 backdrop-blur-[0.5px]"
                  : "bg-indigo-500/10 border-x border-b border-indigo-400/30"
              }`}>
                 {/* Liquid Inside Tip (Beautifully visualizes real liquid intake) */}
                 <motion.div 
                   animate={{ 
                     height: (isAspirating || isMixing) ? '75%' : '0%',
                   }}
                   transition={{ duration: 0.4 }}
                   className="w-full bg-gradient-to-t from-indigo-500 via-indigo-400 to-indigo-300 border-t border-rgba(255,255,255,0.4) opacity-90 shadow-[inset_0_2px_4px_rgba(255,255,255,0.6)]"
                 />
              </div>
              {/* Tip Orifice Needle (Exact physical target point) */}
              <div className={`w-1.5 h-4 -mt-0.5 rounded-b-full shadow-sm border-x ${
                isGlass
                  ? "bg-slate-600/30 border-slate-700/10"
                  : "bg-slate-600 border-slate-700"
              }`} />
            </motion.div>

            {/* Calibrated Landing Shadow */}
            <motion.div 
              animate={{
                 scale: (isAspirating || isMixing) ? 0.75 : 1.25,
                 opacity: (isAspirating || isMixing) ? (isGlass ? 0.2 : 0.4) : (isGlass ? 0.05 : 0.15),
                 y: (isAspirating || isMixing) ? -10 : 8
              }}
              className="absolute top-full mt-2 w-10 h-2 bg-black blur-[3px] rounded-full -z-10" 
            />
          </div>
        )}
      </motion.div>
    </>
  );
}


