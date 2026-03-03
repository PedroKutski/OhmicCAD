import { ComponentModel, WireModel, ComponentType } from '../types';

export interface CircuitData {
    components: ComponentModel[];
    wires: WireModel[];
}

export interface CircuitItem {
    name: string;
    id: string;
    data?: () => CircuitData; // Lazy load or generator
    usageHint?: string;
}

export interface CircuitCategory {
    name: string;
    items: (CircuitItem | CircuitCategory)[];
}

// Helper to generate simple circuits
const emptySim = { voltage: 0, current: 0, power: 0, eField: 0, bField: 0, driftV: 0, flowDir: 0 };

const genOhmsLaw = (): CircuitData => {
    const batId = 'V1';
    const resId = 'R1';
    const w1Id = 'w1';
    const w2Id = 'w2';
    
    return {
        components: [
            { id: batId, type: ComponentType.Battery, x: 100, y: 200, rotation: 3, state: false, props: { name: 'V1', voltage: 5 }, simData: { voltage: 0, current: 0, power: 0, eField: 0, bField: 0, driftV: 0, flowDir: 0 } },
            { id: resId, type: ComponentType.Resistor, x: 300, y: 200, rotation: 1, state: false, props: { name: 'R1', resistance: 100 }, simData: { ...emptySim } }
        ],
        wires: [
            { id: w1Id, compAId: batId, portAIndex: 1, compBId: resId, portBIndex: 0, anchor: null, path: [{x: 100, y: 160}, {x: 300, y: 160}], selected: false, simData: { ...emptySim }, props: { name: 'w1' } },
            { id: w2Id, compAId: resId, portAIndex: 1, compBId: batId, portBIndex: 0, anchor: null, path: [{x: 300, y: 240}, {x: 100, y: 240}], selected: false, simData: { ...emptySim }, props: { name: 'w2' } }
        ]
    };
};

const genResistorDivider = (): CircuitData => ({
    components: [
        { id: 'V1', type: ComponentType.Battery, x: 80, y: 220, rotation: 3, state: false, props: { name: 'V1', voltage: 12 }, simData: { ...emptySim } },
        { id: 'R1', type: ComponentType.Resistor, x: 250, y: 180, rotation: 1, state: false, props: { name: 'R1', resistance: 1000 }, simData: { ...emptySim } },
        { id: 'R2', type: ComponentType.Resistor, x: 250, y: 260, rotation: 1, state: false, props: { name: 'R2', resistance: 1000 }, simData: { ...emptySim } }
    ],
    wires: [
        { id: 'w1', compAId: 'V1', portAIndex: 1, compBId: 'R1', portBIndex: 0, anchor: null, path: [{x: 80, y: 180}, {x: 250, y: 140}, {x: 250, y: 140}], selected: false, simData: { ...emptySim }, props: { name: 'w1' } },
        { id: 'w2', compAId: 'R1', portAIndex: 1, compBId: 'R2', portBIndex: 0, anchor: null, path: [{x: 250, y: 220}], selected: false, simData: { ...emptySim }, props: { name: 'w2' } },
        { id: 'w3', compAId: 'R2', portAIndex: 1, compBId: 'V1', portBIndex: 0, anchor: null, path: [{x: 250, y: 300}, {x: 80, y: 260}], selected: false, simData: { ...emptySim }, props: { name: 'w3' } }
    ]
});

const genCapacitorTiming = (): CircuitData => ({
    components: [
        { id: 'V1', type: ComponentType.Battery, x: 90, y: 210, rotation: 3, state: false, props: { name: 'V1', voltage: 9 }, simData: { ...emptySim } },
        { id: 'R1', type: ComponentType.Resistor, x: 250, y: 170, rotation: 1, state: false, props: { name: 'R1', resistance: 1000 }, simData: { ...emptySim } },
        { id: 'C1', type: ComponentType.Capacitor, x: 250, y: 260, rotation: 1, state: false, props: { name: 'C1', capacitance: 100, capacitanceUnit: 'µF' }, simData: { ...emptySim } }
    ],
    wires: [
        { id: 'w1', compAId: 'V1', portAIndex: 1, compBId: 'R1', portBIndex: 0, anchor: null, path: [{x: 90, y: 170}, {x: 250, y: 130}], selected: false, simData: { ...emptySim }, props: { name: 'w1' } },
        { id: 'w2', compAId: 'R1', portAIndex: 1, compBId: 'C1', portBIndex: 0, anchor: null, path: [{x: 250, y: 210}], selected: false, simData: { ...emptySim }, props: { name: 'w2' } },
        { id: 'w3', compAId: 'C1', portAIndex: 1, compBId: 'V1', portBIndex: 0, anchor: null, path: [{x: 250, y: 300}, {x: 90, y: 250}], selected: false, simData: { ...emptySim }, props: { name: 'w3' } }
    ]
});

const genInductorFilter = (): CircuitData => ({
    components: [
        { id: 'V1', type: ComponentType.Battery, x: 90, y: 220, rotation: 3, state: false, props: { name: 'V1', voltage: 12 }, simData: { ...emptySim } },
        { id: 'L1', type: ComponentType.Inductor, x: 250, y: 170, rotation: 1, state: false, props: { name: 'L1', inductance: 0.1 }, simData: { ...emptySim } },
        { id: 'R1', type: ComponentType.Resistor, x: 250, y: 270, rotation: 1, state: false, props: { name: 'R1', resistance: 47 }, simData: { ...emptySim } }
    ],
    wires: [
        { id: 'w1', compAId: 'V1', portAIndex: 1, compBId: 'L1', portBIndex: 0, anchor: null, path: [{x: 90, y: 180}, {x: 250, y: 130}], selected: false, simData: { ...emptySim }, props: { name: 'w1' } },
        { id: 'w2', compAId: 'L1', portAIndex: 1, compBId: 'R1', portBIndex: 0, anchor: null, path: [{x: 250, y: 220}], selected: false, simData: { ...emptySim }, props: { name: 'w2' } },
        { id: 'w3', compAId: 'R1', portAIndex: 1, compBId: 'V1', portBIndex: 0, anchor: null, path: [{x: 250, y: 310}, {x: 90, y: 260}], selected: false, simData: { ...emptySim }, props: { name: 'w3' } }
    ]
});

const genRlcSeries = (): CircuitData => ({
    components: [
        { id: 'VAC1', type: ComponentType.ACSource, x: 80, y: 220, rotation: 3, state: false, props: { name: 'VAC1', amplitude: 5, frequency: 1000 }, simData: { ...emptySim } },
        { id: 'R1', type: ComponentType.Resistor, x: 200, y: 220, rotation: 1, state: false, props: { name: 'R1', resistance: 100 }, simData: { ...emptySim } },
        { id: 'L1', type: ComponentType.Inductor, x: 320, y: 220, rotation: 1, state: false, props: { name: 'L1', inductance: 0.05 }, simData: { ...emptySim } },
        { id: 'C1', type: ComponentType.Capacitor, x: 440, y: 220, rotation: 1, state: false, props: { name: 'C1', capacitance: 1, capacitanceUnit: 'µF' }, simData: { ...emptySim } }
    ],
    wires: [
        { id: 'w1', compAId: 'VAC1', portAIndex: 1, compBId: 'R1', portBIndex: 0, anchor: null, path: [{x: 80, y: 180}, {x: 200, y: 180}], selected: false, simData: { ...emptySim }, props: { name: 'w1' } },
        { id: 'w2', compAId: 'R1', portAIndex: 1, compBId: 'L1', portBIndex: 0, anchor: null, path: [{x: 260, y: 220}], selected: false, simData: { ...emptySim }, props: { name: 'w2' } },
        { id: 'w3', compAId: 'L1', portAIndex: 1, compBId: 'C1', portBIndex: 0, anchor: null, path: [{x: 380, y: 220}], selected: false, simData: { ...emptySim }, props: { name: 'w3' } },
        { id: 'w4', compAId: 'C1', portAIndex: 1, compBId: 'VAC1', portBIndex: 0, anchor: null, path: [{x: 440, y: 260}, {x: 80, y: 260}], selected: false, simData: { ...emptySim }, props: { name: 'w4' } }
    ]
});

const genLedOn = (): CircuitData => ({
    components: [
        { id: 'V1', type: ComponentType.Battery, x: 100, y: 220, rotation: 3, state: false, props: { name: 'V1', voltage: 9 }, simData: { ...emptySim } },
        { id: 'R1', type: ComponentType.Resistor, x: 260, y: 180, rotation: 1, state: false, props: { name: 'R1', resistance: 330 }, simData: { ...emptySim } },
        { id: 'LED1', type: ComponentType.LED, x: 260, y: 280, rotation: 1, state: false, props: { name: 'LED1', diodeType: 'led', voltageDrop: 2.2, currentRating: 0.01, saturationCurrent: 9.32e-11, ledColor: '#ff4d4d' }, simData: { ...emptySim } }
    ],
    wires: [
        { id: 'w1', compAId: 'V1', portAIndex: 1, compBId: 'R1', portBIndex: 0, anchor: null, path: [{x: 100, y: 180}, {x: 260, y: 140}], selected: false, simData: { ...emptySim }, props: { name: 'w1' } },
        { id: 'w2', compAId: 'R1', portAIndex: 1, compBId: 'LED1', portBIndex: 0, anchor: null, path: [{x: 260, y: 230}], selected: false, simData: { ...emptySim }, props: { name: 'w2' } },
        { id: 'w3', compAId: 'LED1', portAIndex: 1, compBId: 'V1', portBIndex: 0, anchor: null, path: [{x: 260, y: 320}, {x: 100, y: 260}], selected: false, simData: { ...emptySim }, props: { name: 'w3' } }
    ]
});

export const CIRCUIT_LIBRARY: CircuitCategory[] = [
    {
        name: "Basics",
        items: [
            { name: "Ohm's Law", id: "ohms", data: genOhmsLaw, usageHint: "Ajuste V1 e R1 para praticar V = I × R e observar a corrente resultante." },
            { name: "Resistors", id: "resistors", data: genResistorDivider, usageHint: 'Divisor resistivo: ajuste R1 e R2 para observar Vout = Vin × (R2/(R1+R2)).' },
            { name: "Capacitor", id: "cap", data: genCapacitorTiming, usageHint: 'Exemplo RC: altere R ou C para aumentar/diminuir o tempo de carga do capacitor.' },
            { name: "Inductor", id: "induct", data: genInductorFilter, usageHint: 'Exemplo RL: aumente L para desacelerar a variação de corrente.' },
            { name: "LRC Circuit", id: "lrc", data: genRlcSeries, usageHint: 'RLC série: mude a frequência da fonte AC para ver a região de ressonância.' },
            { name: "LED On", id: "led-on", data: genLedOn, usageHint: 'LED com resistor limitador: ajuste R1 para manter corrente segura (~20 mA).' },
            { name: "Voltage Divider", id: "voltdivide" },
            { name: "Potentiometer", id: "pot" },
            { name: "Potentiometer Divider", id: "potdivide" },
            { name: "Thevenin's Theorem", id: "thevenin" },
            { name: "Norton's Theorem", id: "norton" },
        ]
    },
    {
        name: "A/C Circuits",
        items: [
            { name: "Capacitor", id: "capac" },
            { name: "Inductor", id: "inductac" },
            { name: "Caps of Various Capacitances", id: "capmultcaps" },
            { name: "Caps w/ Various Frequencies", id: "capmultfreq" },
            { name: "Inductors of Various Inductances", id: "indmultind" },
            { name: "Inductors w/ Various Frequencies", id: "indmultfreq" },
            { name: "Impedances of Same Magnitude", id: "impedance" },
            { name: "Series Resonance", id: "res-series" },
            { name: "Parallel Resonance", id: "res-par" },
        ]
    },
    {
        name: "Passive Filters",
        items: [
            { name: "High-Pass Filter (RC)", id: "filt-hipass" },
            { name: "Low-Pass Filter (RC)", id: "filt-lopass" },
            { name: "High-Pass Filter (RL)", id: "filt-hipass-l" },
            { name: "Low-Pass Filter (RL)", id: "filt-lopass-l" },
            { name: "Band-pass Filter", id: "bandpass" },
            { name: "Notch Filter", id: "notch" },
            { name: "Twin-T Filter", id: "twint" },
            { name: "Crossover", id: "crossover" },
            { name: "Butterworth Low-Pass (10 pole)", id: "butter10lo" },
            { name: "Bessel vs Butterworth", id: "besselbutter" },
            { name: "Band-pass with Ringing", id: "ringing" },
        ]
    },
    {
        name: "Other Passive Circuits",
        items: [
            {
                name: "Series/Parallel",
                items: [
                    { name: "Inductors in Series", id: "indseries" },
                    { name: "Inductors in Parallel", id: "indpar" },
                    { name: "Caps in Series", id: "capseries" },
                    { name: "Caps in Parallel", id: "cappar" },
                ]
            },
            {
                name: "Transformers",
                items: [
                    { name: "Transformer", id: "transformer" },
                    { name: "Transformer w/ DC", id: "transformerdc" },
                    { name: "Step-Up Transformer", id: "transformerup" },
                    { name: "Step-Down Transformer", id: "transformerdown" },
                    { name: "Long-Distance Power Transmission", id: "longdist" },
                ]
            },
            {
                name: "Relays",
                items: [
                    { name: "Relay", id: "relay" },
                    { name: "Relay AND", id: "relayand" },
                    { name: "Relay OR", id: "relayor" },
                    { name: "Relay XOR", id: "relayxor" },
                    { name: "Relay Mux", id: "relaymux" },
                    { name: "Relay Flip-Flop", id: "relayff" },
                    { name: "Relay Toggle Flip-Flop", id: "relaytff" },
                    { name: "Relay Counter", id: "relayctr" },
                ]
            },
            { name: "3-Way Light Switches", id: "3way" },
            { name: "3- and 4-Way Light Switches", id: "4way" },
            { name: "Differentiator", id: "diff" },
            { name: "Wheatstone Bridge", id: "wheatstone" },
            { name: "Critically Damped LRC", id: "lrc-critical" },
            { name: "Current Source", id: "currentsrcelm" },
            { name: "Inductive Kickback", id: "inductkick" },
            { name: "Blocking Inductive Kickback", id: "inductkick-snub" },
            { name: "Power Factor", id: "powerfactor1" },
            { name: "Power Factor Correction", id: "powerfactor2" },
            { name: "Resistor Grid", id: "grid" },
            { name: "Resistor Grid 2", id: "grid2" },
            { name: "Resistor Cube", id: "cube" },
            {
                name: "Coupled LC's",
                items: [
                    { name: "LC Modes (2)", id: "coupled1" },
                    { name: "Weak Coupling", id: "coupled2" },
                    { name: "LC Modes (3)", id: "coupled3" },
                    { name: "LC Ladder", id: "ladder" },
                ]
            },
            { name: "Phase-Sequence Network", id: "phaseseq" },
            { name: "Lissajous Figures", id: "lissa" },
        ]
    },
    {
        name: "Diodes",
        items: [
            { name: "Diode", id: "diodevar" },
            { name: "Diode I/V Curve", id: "diodecurve" },
            { name: "Half-Wave Rectifier", id: "rectify" },
            { name: "Full-Wave Rectifier", id: "fullrect" },
            { name: "Full-Wave Rectifier w/ Filter", id: "fullrectf" },
            { name: "Diode Limiter", id: "diodelimit" },
            {
                name: "Zener Diodes",
                items: [
                    { name: "I/V Curve", id: "zeneriv" },
                    { name: "Voltage Reference", id: "zenerref" },
                    { name: "Voltage Reference w/ Follower", id: "zenerreffollow" },
                ]
            },
            { name: "DC Restoration", id: "dcrestoration" },
            { name: "Blocking Inductive Kickback", id: "inductkick-block" },
            { name: "Spike Generator", id: "spikegen" },
            {
                name: "Voltage Multipliers",
                items: [
                    { name: "Voltage Doubler", id: "voltdouble" },
                    { name: "Voltage Doubler 2", id: "voltdouble2" },
                    { name: "Voltage Tripler", id: "volttriple" },
                    { name: "Voltage Quadrupler", id: "voltquad" },
                ]
            },
            { name: "AM Detector", id: "amdetect" },
            { name: "Waveform Clipper", id: "diodeclip" },
            { name: "Triangle-to-Sine Converter", id: "sinediode" },
            { name: "Ring Modulator", id: "ringmod" },
        ]
    },
    {
        name: "Op-Amps",
        items: [
            { name: "Op-Amp", id: "opamp" },
            { name: "Op-Amp Feedback", id: "opampfeedback" },
            {
                name: "Amplifiers",
                items: [
                    { name: "Inverting Amplifier", id: "amp-invert" },
                    { name: "Noninverting Amplifier", id: "amp-noninvert" },
                    { name: "Follower", id: "amp-follower" },
                    { name: "Differential Amplifier", id: "amp-diff" },
                    { name: "Summing Amplifier", id: "amp-sum" },
                    { name: "Log Amplifier", id: "logconvert" },
                    { name: "Class-D Amplifier", id: "classd" },
                ]
            },
            {
                name: "Oscillators",
                items: [
                    { name: "Relaxation Oscillator", id: "relaxosc" },
                    { name: "Phase-Shift Oscillator", id: "phaseshiftosc" },
                    { name: "Triangle Wave Generator", id: "triangle" },
                    { name: "Sine Wave Generator", id: "sine" },
                    { name: "Sawtooth Wave Generator", id: "sawtooth" },
                    { name: "Voltage-Controlled Oscillator", id: "vco" },
                    { name: "Rossler Circuit", id: "rossler" },
                ]
            },
            { name: "Half-Wave Rectifier (inverting)", id: "amp-rect" },
            { name: "Full-Wave Rectifier", id: "amp-fullrect" },
            { name: "Peak Detector", id: "peak-detect" },
            { name: "Integrator", id: "amp-integ" },
            { name: "Differentiator", id: "amp-dfdx" },
            { name: "Schmitt Trigger", id: "amp-schmitt" },
            { name: "Negative Impedance Converter", id: "nic-r" },
            { name: "Gyrator", id: "gyrator" },
            { name: "Capacitance Multiplier", id: "capmult" },
            { name: "Howland Current Source", id: "howland" },
            { name: "I-to-V Converter", id: "itov" },
            { name: "Voltage Regulator", id: "opamp-regulator" },
            { name: "741 Internals", id: "opint" },
            { name: "741 (inverting amplifier)", id: "opint-invert-amp" },
            { name: "741 Slew Rate", id: "opint-slew" },
            { name: "741 Current Limits", id: "opint-current" },
        ]
    },
    {
        name: "Transistors",
        items: [
            { name: "NPN Transistor", id: "npn" },
            { name: "PNP Transistor", id: "pnp" },
            { name: "Switch", id: "transswitch" },
            { name: "Emitter Follower", id: "follower" },
            {
                name: "Multivibrators",
                items: [
                    { name: "Astable Multivib", id: "multivib-a" },
                    { name: "Bistable Multivib (Flip-Flop)", id: "multivib-bi" },
                    { name: "Monostable Multivib (One-Shot)", id: "multivib-mono" },
                ]
            },
            { name: "Common-Emitter Amplifier", id: "ceamp" },
            { name: "Unity-Gain Phase Splitter", id: "phasesplit" },
            { name: "Schmitt Trigger", id: "schmitt" },
            { name: "Current Source", id: "currentsrc" },
            { name: "Current Source Ramp", id: "currentsrcramp" },
            { name: "Current Mirror", id: "mirror" },
            { name: "Darlington Pair", id: "darlington" },
            {
                name: "Differential Amplifiers",
                items: [
                    { name: "Differential Input", id: "trans-diffamp" },
                    { name: "Common-Mode Input", id: "trans-diffamp-common" },
                    { name: "Common-Mode w/Current Source", id: "trans-diffamp-cursrc" },
                ]
            },
            {
                name: "Push-Pull Follower",
                items: [
                    { name: "Simple, with distortion", id: "pushpullxover" },
                    { name: "Improved", id: "pushpull" },
                ]
            },
            {
                name: "Oscillators",
                items: [
                    { name: "Colpitts Oscillator", id: "colpitts" },
                    { name: "Hartley Oscillator", id: "hartley" },
                    { name: "Emitter-Coupled LC Oscillator", id: "eclosc" },
                ]
            },
        ]
    },
    {
        name: "MOSFETs",
        items: [
            { name: "n-MOSFET", id: "nmosfet" },
            { name: "p-MOSFET", id: "pmosfet" },
            { name: "Switch", id: "mosswitch" },
            { name: "Source Follower", id: "mosfollower" },
            { name: "Current Source", id: "moscurrentsrc" },
            { name: "Current Ramp", id: "moscurrentramp" },
            { name: "Current Mirror", id: "mosmirror" },
            { name: "Common-Source Amplifier", id: "mosfetamp" },
            { name: "CMOS Inverter", id: "cmosinverter" },
            { name: "CMOS Inverter (w/capacitance)", id: "cmosinvertercap" },
            { name: "CMOS Inverter (slow transition)", id: "cmosinverterslow" },
            { name: "CMOS Transmission Gate", id: "cmostransgate" },
            { name: "CMOS Multiplexer", id: "mux" },
            { name: "Sample-and-Hold", id: "samplenhold" },
            { name: "Delayed Buffer", id: "delayrc" },
            { name: "Leading-Edge Detector", id: "leadingedge" },
            { name: "Switchable Filter", id: "switchfilter" },
            { name: "Voltage Inverter", id: "voltinvert" },
            { name: "Inverter Amplifier", id: "invertamp" },
            { name: "Inverter Oscillator", id: "inv-osc" },
        ]
    },
    {
        name: "555 Timer Chip",
        items: [
            { name: "Square Wave Generator", id: "555square" },
            { name: "Internals", id: "555int" },
            { name: "Sawtooth Oscillator", id: "555saw" },
            { name: "Low-duty-cycle Oscillator", id: "555lowduty" },
            { name: "Monostable Multivibrator", id: "555monostable" },
            { name: "Pulse Width Modulator", id: "555pulsemod" },
            { name: "Pulse Sequencer", id: "555sequencer" },
            { name: "Schmitt Trigger (inverting)", id: "555schmitt" },
            { name: "Missing Pulse Detector", id: "555missing" },
        ]
    },
    {
        name: "Active Filters",
        items: [
            { name: "VCVS Low-Pass Filter", id: "filt-vcvs-lopass" },
            { name: "VCVS High-Pass Filter", id: "filt-vcvs-hipass" },
            { name: "Switched-Capacitor Filter", id: "switchedcap" },
            { name: "Allpass", id: "allpass1" },
            { name: "Allpass w/ Square", id: "allpass2" },
        ]
    },
    {
        name: "Logic Families",
        items: [
            {
                name: "RTL",
                items: [
                    { name: "RTL Inverter", id: "rtlinverter" },
                    { name: "RTL NOR", id: "rtlnor" },
                    { name: "RTL NAND", id: "rtlnand" },
                ]
            },
            {
                name: "DTL",
                items: [
                    { name: "DTL Inverter", id: "dtlinverter" },
                    { name: "DTL NAND", id: "dtlnand" },
                    { name: "DTL NOR", id: "dtlnor" },
                ]
            },
            {
                name: "TTL",
                items: [
                    { name: "TTL Inverter", id: "ttlinverter" },
                    { name: "TTL NAND", id: "ttlnand" },
                    { name: "TTL NOR", id: "ttlnor" },
                ]
            },
            {
                name: "NMOS",
                items: [
                    { name: "NMOS Inverter", id: "nmosinverter" },
                    { name: "NMOS Inverter 2", id: "nmosinverter2" },
                    { name: "NMOS NAND", id: "nmosnand" },
                ]
            },
            {
                name: "CMOS",
                items: [
                    { name: "CMOS Inverter", id: "cmosinverter" },
                    { name: "CMOS NAND", id: "cmosnand" },
                    { name: "CMOS NOR", id: "cmosnor" },
                    { name: "CMOS XOR", id: "cmosxor" },
                    { name: "CMOS Flip-Flop", id: "cmosff" },
                    { name: "CMOS Master-Slave Flip-Flop", id: "cmosmsff" },
                ]
            },
            {
                name: "ECL",
                items: [
                    { name: "ECL NOR/OR", id: "eclnor" },
                ]
            },
            {
                name: "Ternary",
                items: [
                    { name: "CGAND", id: "3-cgand" },
                    { name: "CGOR", id: "3-cgor" },
                    { name: "Complement (F210)", id: "3-invert" },
                    { name: "F211", id: "3-f211" },
                    { name: "F220", id: "3-f220" },
                    { name: "F221", id: "3-f221" },
                ]
            },
        ]
    },
    {
        name: "Combinational Logic",
        items: [
            { name: "Exclusive OR", id: "xor" },
            { name: "Half Adder", id: "halfadd" },
            { name: "Full Adder", id: "fulladd" },
            { name: "1-of-4 Decoder", id: "decoder" },
            { name: "2-to-1 Mux", id: "mux3state" },
            { name: "Majority Logic", id: "majority" },
            { name: "2-Bit Comparator", id: "digcompare" },
            { name: "7-Segment LED Decoder", id: "7segdecoder" },
        ]
    },
    {
        name: "Sequential Logic",
        items: [
            {
                name: "Flip-Flops",
                items: [
                    { name: "SR Flip-Flop", id: "nandff" },
                    { name: "Clocked SR Flip-Flop", id: "clockedsrff" },
                    { name: "Master-Slave Flip-Flop", id: "masterslaveff" },
                    { name: "Edge-Triggered D Flip-Flop", id: "edgedff" },
                    { name: "JK Flip-Flop", id: "jkff" },
                ]
            },
            {
                name: "Counters",
                items: [
                    { name: "4-Bit Ripple Counter", id: "counter" },
                    { name: "8-Bit Ripple Counter", id: "counter8" },
                    { name: "Synchronous Counter", id: "synccounter" },
                    { name: "Decimal Counter", id: "deccounter" },
                    { name: "Gray Code Counter", id: "graycode" },
                    { name: "Johnson Counter", id: "johnsonctr" },
                ]
            },
            { name: "Divide-by-2", id: "divideby2" },
            { name: "Divide-by-3", id: "divideby3" },
            { name: "LED Flasher", id: "ledflasher" },
            { name: "Traffic Light", id: "traffic" },
            { name: "Dynamic RAM", id: "dram" },
        ]
    },
    {
        name: "Analog/Digital",
        items: [
            { name: "Flash ADC", id: "flashadc" },
            { name: "Delta-Sigma ADC", id: "deltasigma" },
            { name: "Half-Flash (Subranging) ADC", id: "hfadc" },
            { name: "Binary-Weighted DAC", id: "dac" },
            { name: "R-2R Ladder DAC", id: "r2rladder" },
            { name: "Switch-Tree DAC", id: "swtreedac" },
            { name: "Digital Sine Wave", id: "digsine" },
        ]
    },
    {
        name: "Phase-Locked Loops",
        items: [
            { name: "XOR Phase Detector", id: "xorphasedet" },
            { name: "Type I PLL", id: "pll" },
            { name: "Phase Comparator (Type II)", id: "phasecomp" },
            { name: "Phase Comparator Internals", id: "phasecompint" },
            { name: "Type II PLL", id: "pll2" },
            { name: "Type II PLL (fast)", id: "pll2a" },
            { name: "Frequency Doubler", id: "freqdouble" },
        ]
    },
    {
        name: "Transmission Lines",
        items: [
            { name: "Simple TL", id: "tl" },
            { name: "Standing Wave", id: "tlstand" },
            { name: "Termination", id: "tlterm" },
            { name: "Mismatched lines (Pulse)", id: "tlmismatch" },
            { name: "Mismatched lines (Standing Wave)", id: "tlmis1" },
            { name: "Impedance Matching (L-Section)", id: "tlmatch1" },
            { name: "Impedance Matching (Shunt Stub)", id: "tlmatch2" },
            { name: "Stub Frequency Response", id: "tlfreq" },
            { name: "Low-Pass Filter", id: "tllopass" },
            { name: "Light Switch", id: "tllight" },
        ]
    },
    {
        name: "Misc Devices",
        items: [
            {
                name: "JFETs",
                items: [
                    { name: "JFET Current Source", id: "jfetcurrentsrc" },
                    { name: "JFET Follower", id: "jfetfollower" },
                    { name: "JFET Follower w/zero offset", id: "jfetfollower-nooff" },
                    { name: "Common-Source Amplifier", id: "jfetamp" },
                    { name: "Volume Control", id: "volume" },
                ]
            },
            {
                name: "Tunnel Diodes",
                items: [
                    { name: "I/V Curve", id: "tdiode" },
                    { name: "LC Oscillator", id: "tdosc" },
                    { name: "Relaxation Oscillator", id: "tdrelax" },
                ]
            },
            {
                name: "Memristors",
                items: [
                    { name: "Memristor", id: "mr" },
                    { name: "Sine Wave", id: "mr-sine" },
                    { name: "Square Wave", id: "mr-square" },
                    { name: "Triangle Wave", id: "mr-triangle" },
                    { name: "Hard-Switching 1", id: "mr-sine2" },
                    { name: "Hard-Switching 2", id: "mr-sine3" },
                    { name: "Crossbar Memory", id: "mr-crossbar" },
                ]
            },
            {
                name: "Triodes",
                items: [
                    { name: "Triode", id: "triode" },
                    { name: "Amplifier", id: "triodeamp" },
                ]
            },
            {
                name: "Silicon-Controlled Rectifiers",
                items: [
                    { name: "SCR", id: "scr" },
                    { name: "AC Trigger", id: "scractrig" },
                ]
            },
            {
                name: "Current Conveyor",
                items: [
                    { name: "CCII+", id: "cc2" },
                    { name: "CCII-", id: "cc2n" },
                    { name: "Inductor Simulator", id: "ccinductor" },
                    { name: "CCII+ Implementation", id: "cc2imp" },
                    { name: "CCII- Implementation", id: "cc2impn" },
                    { name: "Current Amplifier", id: "cciamp" },
                    { name: "VCCS", id: "ccvccs" },
                    { name: "Current Differentiator", id: "ccdiff" },
                    { name: "Current Integrator", id: "ccint" },
                    { name: "Current-Controlled Voltage Source", id: "ccitov" },
                ]
            },
            {
                name: "Spark Gap",
                items: [
                    { name: "Sawtooth Generator", id: "spark-sawtooth" },
                    { name: "Tesla Coil", id: "tesla" },
                    { name: "Marx Generator", id: "spark-marx" },
                ]
            },
        ]
    }
];
