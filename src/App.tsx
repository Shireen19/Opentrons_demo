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
  Zap
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

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 font-sans flex flex-col md:flex-row">
      <aside className="w-full md:w-[350px] bg-white border-r border-slate-200 p-6 flex flex-col gap-6 shadow-sm z-10 overflow-y-auto">
        <header className="flex items-center gap-3">
          <div className="p-2 bg-indigo-600 rounded-lg text-white">
            <FlaskConical size={24} />
          </div>
          <div>
            <h1 className="text-xl font-bold tracking-tight text-slate-800 leading-tight">Opentrons Designer</h1>
            <p className="text-[10px] text-slate-500 font-bold uppercase tracking-widest mt-0.5">Automated Labware v2</p>
          </div>
        </header>

        <div className="space-y-6">
          <section className="space-y-4">
            <div className="flex items-center gap-2 text-slate-400 font-bold text-[10px] uppercase tracking-widest border-b border-slate-100 pb-2">
              <Settings2 size={12} />
              孔位参数
            </div>
            
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <label className="text-[11px] font-bold text-slate-500">起始</label>
                <select 
                  value={startWell}
                  onChange={(e) => {setStartWell(e.target.value); resetAnimation();}}
                  className="w-full bg-slate-50 border border-slate-200 rounded-lg px-2 py-2 text-xs font-semibold focus:ring-2 focus:ring-indigo-500 transition-all outline-none"
                >
                  {WELLS.map(w => <option key={w} value={w}>{w}</option>)}
                </select>
              </div>
              <div className="space-y-1.5">
                <label className="text-[11px] font-bold text-slate-500">截止</label>
                <select 
                  value={endWell}
                  onChange={(e) => {setEndWell(e.target.value); resetAnimation();}}
                  className="w-full bg-slate-50 border border-slate-200 rounded-lg px-2 py-2 text-xs font-semibold focus:ring-2 focus:ring-indigo-500 transition-all outline-none"
                >
                  {WELLS.map(w => <option key={w} value={w}>{w}</option>)}
                </select>
              </div>
            </div>
          </section>

          <section className="space-y-4">
            <div className="flex items-center gap-2 text-slate-400 font-bold text-[10px] uppercase tracking-widest border-b border-slate-100 pb-2">
              <Beaker size={12} />
              实验逻辑
            </div>
            
            <div className="space-y-5">
              <div className="space-y-2">
                <div className="flex justify-between items-end">
                  <label className="text-[11px] font-bold text-slate-500">转移体积</label>
                  <span className="text-xs font-mono font-bold text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded-full">{transferVol} µL</span>
                </div>
                <input 
                  type="range" min="1" max="250" step="1"
                  value={transferVol}
                  onChange={(e) => setTransferVol(Number(e.target.value))}
                  className="w-full h-1.5 bg-slate-100 rounded-lg appearance-none cursor-pointer accent-indigo-600"
                />
              </div>

              <div className="space-y-2">
                <div className="flex justify-between items-end">
                  <label className="text-[11px] font-bold text-slate-500">混匀次数</label>
                  <span className="text-xs font-mono font-bold text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded-full">{mixCount} 次</span>
                </div>
                <input 
                  type="range" min="1" max="10" step="1"
                  value={mixCount}
                  onChange={(e) => setMixCount(Number(e.target.value))}
                  className="w-full h-1.5 bg-slate-100 rounded-lg appearance-none cursor-pointer accent-indigo-600"
                />
              </div>
            </div>
          </section>

          <div className="grid grid-cols-2 gap-3">
            <button 
              onClick={() => { setIsAnimating(!isAnimating); if (currentAction === 'Completed') resetAnimation(); }}
              className={`py-3 rounded-xl font-bold text-xs transition-all flex items-center justify-center gap-2 shadow-sm ${
                isAnimating 
                ? "bg-amber-100 text-amber-700 hover:bg-amber-200 border border-amber-200" 
                : "bg-indigo-600 text-white hover:bg-indigo-700 shadow-indigo-100"
              }`}
            >
              {isAnimating ? <Pause size={14} /> : <Play size={14} />}
              {isAnimating ? "暂停演示" : (currentAction === 'Completed' ? "重新播放" : "开始演示")}
            </button>
            <button 
              onClick={resetAnimation}
              className="py-3 bg-white border border-slate-200 text-slate-600 rounded-xl font-bold text-xs hover:bg-slate-50 transition-all flex items-center justify-center gap-2"
            >
              <RotateCcw size={14} />
              重置
            </button>
          </div>

          <button 
            onClick={() => setShowCode(!showCode)}
            className="w-full py-3.5 bg-slate-900 text-white rounded-xl font-bold text-xs shadow-lg shadow-slate-200 transition-all active:scale-[0.98] flex items-center justify-center gap-2"
          >
            <FileCode size={16} />
            {showCode ? "返回可视化视图" : "查看 Python 代码"}
          </button>
        </div>

        <div className="mt-auto pt-6 border-t border-slate-100">
          <div className={`p-4 rounded-xl border transition-colors ${isAnimating ? "bg-indigo-50 border-indigo-100" : "bg-slate-50 border-slate-100"}`}>
            <div className="flex items-center gap-2 mb-2">
              <Zap size={14} className={isAnimating ? "text-indigo-600 animate-pulse" : "text-slate-400"} />
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">实时状态</span>
            </div>
            <p className={`text-xs font-mono font-medium ${isAnimating ? "text-indigo-700" : "text-slate-500"}`}>
              {currentAction}
            </p>
          </div>
        </div>
      </aside>

      <main ref={mainRef} className="flex-1 p-4 md:p-8 relative flex flex-col items-center justify-center overflow-hidden bg-slate-100/30">
        <AnimatePresence mode="wait">
          {!showCode ? (
            <motion.div 
              key="viz"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="w-full max-w-5xl bg-white rounded-[2rem] shadow-2xl shadow-indigo-100/40 p-6 md:p-10 border border-slate-100 relative"
            >
              <div className="mb-8 flex flex-col md:flex-row md:items-end justify-between gap-4 border-b border-slate-50 pb-6">
                <div className="flex items-center gap-4">
                   <div className="p-3 bg-indigo-50 rounded-2xl text-indigo-600">
                    <FlaskConical size={28} />
                   </div>
                   <div>
                    <h2 className="text-2xl font-bold text-slate-800 tracking-tight">Opentrons OT-2 仿真视图</h2>
                    <p className="text-slate-400 text-xs font-bold uppercase tracking-widest mt-0.5">Slot 2 • Corning 96 Well Plate</p>
                   </div>
                </div>
                <div className="flex gap-6 items-center bg-slate-50 px-5 py-2.5 rounded-2xl border border-slate-100">
                  <div className="flex items-center gap-2">
                    <div className="w-2.5 h-2.5 rounded-full bg-rose-500 shadow-sm shadow-rose-200" />
                    <span className="text-[10px] font-bold text-slate-500 uppercase tracking-tight">Source (母液)</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="w-2.5 h-2.5 rounded-full bg-indigo-500 shadow-sm shadow-indigo-200" />
                    <span className="text-[10px] font-bold text-slate-500 uppercase tracking-tight">Daughter (子孔)</span>
                  </div>
                </div>
              </div>

              <div ref={deckRef} className="relative p-4 md:p-8 bg-slate-100/50 rounded-[2.5rem] border border-slate-200 shadow-inner select-none">
                {/* Column Labels */}
                <div className="grid grid-cols-[40px_repeat(12,1fr)] mb-6">
                  <div />
                  {COLS.map(c => (
                    <div key={c} className="text-center text-[10px] font-black text-slate-400 font-mono tracking-tighter">{c}</div>
                  ))}
                </div>

                {/* Grid Container */}
                <div className="flex flex-col gap-4">
                  {ROWS.map(row => (
                    <div key={row} className="grid grid-cols-[40px_repeat(12,1fr)] items-center">
                      <div className="text-center text-[10px] font-black text-slate-400 font-mono italic">{row}</div>
                      <div className="grid grid-cols-12 gap-2 md:gap-4 px-2 relative">
                        {COLS.map(col => {
                          const wellId = `${row}${col}`;
                          const index = wellToIndex(wellId);
                          const isStart = wellId === startWell;
                          const isEnd = wellId === endWell;
                          const isInPath = pathIndices.includes(index);
                          const pathOrder = pathIndices.indexOf(index);
                          const isActiveWell = activeWell === wellId && isAnimating;
                          
                          return (
                            <div key={wellId} id={`well-${wellId}`} className="relative aspect-square flex items-center justify-center group">
                              {/* Well Label Hover */}
                              <div className="absolute -top-6 left-1/2 -translate-x-1/2 bg-slate-800 text-white text-[8px] px-1.5 py-0.5 rounded opacity-0 group-hover:opacity-100 transition-opacity z-50 pointer-events-none">
                                {wellId}
                              </div>
                              
                              <motion.div 
                                animate={{
                                  backgroundColor: isStart ? '#f43f5e' : (isInPath ? '#6366f1' : '#ffffff'),
                                  borderColor: isActiveWell ? '#ffffff' : (isStart ? '#fb7185' : (isInPath ? 'rgba(99,102,241,0.2)' : '#f1f5f9')),
                                  scale: isActiveWell ? [1, 1.4, 1] : 1,
                                  boxShadow: isActiveWell 
                                    ? '0 0 40px 10px rgba(99,102,241,0.7), inset 0 0 10px rgba(255,255,255,0.5)' 
                                    : (isStart || isEnd ? '0 4px 15px rgba(244,63,94,0.4)' : 'none'),
                                  zIndex: isActiveWell ? 40 : 10
                                }}
                                transition={{ 
                                  scale: isActiveWell ? { 
                                    repeat: isMixing ? Infinity : 0, 
                                    duration: isMixing ? 0.4 : 0.6,
                                    ease: "easeInOut"
                                  } : { duration: 0.3 },
                                  default: { duration: 0.3 }
                                }}
                                className={`w-full aspect-square rounded-full border-2 flex items-center justify-center relative cursor-pointer hover:border-indigo-300 transition-colors shadow-sm`}
                                onClick={() => {
                                  if (!isAnimating) {
                                    setEndWell(wellId);
                                    resetAnimation();
                                  }
                                }}
                              >
                                {isInPath && (
                                  <span className={`text-[8px] font-black text-white drop-shadow-sm ${isActiveWell ? 'scale-125' : ''}`}>
                                    {pathOrder + 1}
                                  </span>
                                )}
                              </motion.div>
                              {/* Well Decoration for Depth */}
                              <div className={`absolute inset-0 bg-slate-200/20 rounded-full scale-[1.25] -z-0 border border-slate-100 ${isActiveWell ? 'opacity-0' : 'opacity-100'}`} />
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>

                {/* Simulated Pipette Robot Arm */}
                <AnimatePresence>
                  {isAnimating && (
                    <PipetteRobotHead 
                      targetWell={activeWell} 
                      isAspirating={isAspirating} 
                      isMixing={isMixing} 
                      mainRef={mainRef}
                    />
                  )}
                </AnimatePresence>
              </div>

              <div className="mt-8 grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="bg-slate-50/50 p-4 rounded-2xl border border-slate-100 flex items-center gap-4">
                  <div className="w-10 h-10 rounded-full bg-slate-200 flex items-center justify-center text-slate-500 font-bold text-xs">P300</div>
                  <div>
                    <h4 className="text-[10px] font-bold uppercase text-slate-400">单道移液器</h4>
                    <p className="text-sm font-bold text-slate-700">Right Arm Mounted</p>
                  </div>
                </div>
                <div className="bg-indigo-600/5 p-4 rounded-2xl border border-indigo-100/50 col-span-2 flex items-center justify-between">
                  <div>
                    <h4 className="text-[10px] font-bold uppercase text-indigo-400">当前任务指令</h4>
                    <p className="text-sm font-bold text-indigo-700 flex items-center gap-2">
                       <span className="w-2 h-2 rounded-full bg-indigo-500 animate-pulse" />
                       {currentAction}
                    </p>
                  </div>
                  <div className="text-right">
                     <p className="text-[10px] font-bold text-slate-400 uppercase">进度</p>
                     <p className="text-sm font-mono font-bold text-indigo-600">
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
              className="w-full max-w-4xl h-[85vh] bg-slate-900 rounded-[2.5rem] shadow-2xl overflow-hidden flex flex-col border border-slate-800"
            >
              <div className="p-5 bg-slate-800/80 backdrop-blur-md flex items-center justify-between border-b border-slate-700/50">
                <div className="flex items-center gap-4">
                  <div className="flex gap-2">
                    <div className="w-3 h-3 rounded-full bg-rose-500/80 shadow-sm" />
                    <div className="w-3 h-3 rounded-full bg-amber-500/80 shadow-sm" />
                    <div className="w-3 h-3 rounded-full bg-emerald-500/80 shadow-sm" />
                  </div>
                  <span className="text-slate-400 text-xs font-mono font-bold tracking-tight">protocol_simulation.py</span>
                </div>
                <div className="flex gap-2">
                  <button 
                    onClick={copyToClipboard}
                    className="flex items-center gap-2 px-5 py-2.5 bg-slate-700 hover:bg-slate-600 text-white rounded-xl text-xs font-bold transition-all active:scale-95"
                  >
                    {copied ? <ClipboardCheck size={14} className="text-emerald-400" /> : <Download size={14} />}
                    {copied ? "已复制" : "复制代码"}
                  </button>
                  <button 
                    onClick={() => setShowCode(false)}
                    className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold transition-all active:scale-95"
                  >
                    返回
                  </button>
                </div>
              </div>
              <div className="flex-1 overflow-auto p-8 font-mono text-[13px] leading-relaxed">
                <pre className="text-emerald-400/90 whitespace-pre-wrap">
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

function PipetteRobotHead({ targetWell, isAspirating, isMixing, mainRef }: { targetWell: string; isAspirating: boolean; isMixing: boolean; mainRef: React.RefObject<HTMLElement | null> }) {
  const [position, setPosition] = useState({ x: 0, y: 0 });

  useEffect(() => {
    const updatePosition = () => {
      const wellEl = document.getElementById(`well-${targetWell}`);
      const container = mainRef.current;
      if (wellEl && container) {
        const rect = wellEl.getBoundingClientRect();
        const containerRect = container.getBoundingClientRect();
        
        // Calculate precise center of the target well relative to main container
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
  }, [targetWell, mainRef]);

  return (
    <>
      {/* Robot Gantry: Y-Axis Bar (moves with Pipette Y) */}
      <motion.div 
        animate={{ y: position.y }} 
        transition={{ type: 'spring', stiffness: 90, damping: 20 }}
        className="absolute left-0 right-0 h-12 bg-slate-300/40 border-y border-slate-400/30 z-[80] pointer-events-none"
        style={{ top: 0, transform: 'translateY(-50%)' }}
      >
         <div className="h-[1px] w-full bg-slate-500/20 mt-6" />
      </motion.div>

      {/* Robot Gantry: X-Axis Bridge (moves with Pipette X) */}
      <motion.div 
        animate={{ x: position.x }} 
        transition={{ type: 'spring', stiffness: 90, damping: 20 }}
        className="absolute top-0 bottom-0 w-16 bg-slate-200/50 border-x border-slate-300/40 z-[90] pointer-events-none flex items-center justify-center"
        style={{ left: 0, transform: 'translateX(-50%)' }}
      >
        <div className="w-[1px] h-full bg-slate-400/20" />
      </motion.div>

      <motion.div 
        initial={false}
        animate={{ 
          x: position.x, 
          y: position.y,
        }}
        transition={{ type: 'spring', stiffness: 90, damping: 20 }}
        className="absolute pointer-events-none z-[100] flex flex-col items-center"
        style={{ left: 0, top: 0 }}
      >
        <div className="relative flex flex-col items-center" style={{ transform: 'translateY(-100%)' }}>
          {/* Pipette Body */}
          <div className="w-12 h-36 bg-gradient-to-br from-slate-200 via-white to-slate-300 rounded-t-2xl shadow-xl border border-slate-300 flex flex-col items-center">
            <div className="mt-4 w-6 h-6 rounded-full bg-indigo-500 flex items-center justify-center font-bold text-[8px] text-white">R</div>
            <div className="w-1 h-12 bg-slate-400/30 mt-4 rounded-full" />
            <div className="mt-auto w-full h-6 bg-slate-400 border-y border-slate-500 rounded-b-sm" />
          </div>
          
          {/* Plunger Axis */}
          <motion.div 
            animate={{ height: (isAspirating || isMixing) ? 55 : 40 }}
            className="w-2 bg-slate-500 border-x border-slate-600 shadow-inner" 
          />
          
          {/* Tip Holder */}
          <div className="w-5 h-8 bg-slate-700 rounded-b-md border-x border-slate-800" />
          
          {/* Disposable Tip */}
          <motion.div 
            animate={{ 
              y: (isAspirating || isMixing) ? 10 : 0,
              scaleY: (isAspirating || isMixing) ? 0.95 : 1
            }}
            className="flex flex-col items-center origin-top flex-shrink-0"
          >
            {/* Tip Body */}
            <div className="w-3.5 h-12 bg-slate-100/40 border border-slate-300 rounded-b-2xl relative overflow-hidden backdrop-blur-[2px]">
               {/* Liquid Inside Tip */}
               <motion.div 
                 animate={{ 
                   height: (isAspirating || isMixing) ? '75%' : '0%',
                   opacity: (isAspirating || isMixing) ? 1 : 0
                 }}
                 className="absolute bottom-0 left-0 right-0 bg-indigo-500/80 shadow-[inset_0_2px_4px_rgba(255,255,255,0.3)]"
               />
            </div>
            {/* Tip Orifice (This point lands and moves into the well) */}
            <div className="w-1.5 h-4 bg-slate-500 -mt-0.5 rounded-b-full shadow-sm" />
          </motion.div>

          {/* Dynamic Shadow */}
          <motion.div 
            animate={{
               scale: (isAspirating || isMixing) ? 0.8 : 1.2,
               opacity: (isAspirating || isMixing) ? 0.15 : 0.05,
               y: (isAspirating || isMixing) ? -8 : 15
            }}
            className="absolute top-full mt-2 w-12 h-3 bg-black blur-md rounded-full -z-10" 
          />
        </div>
      </motion.div>
    </>
  );
}

