"use client";

import { useEffect, useRef, useState, type MouseEvent } from "react";

const editorMenuItems = [
  "File",
  "Edit & Search",
  "View",
  "TeX Insert",
  "Math",
  "Compile",
  "Help",
];

const viewFontSizeMenuItems = ["12px", "14px", "16px", "18px", "20px", "22px", "24px"];

const viewWrapMenuItems = ["Wrap Off", "Wrap On"];

const fileMenuItems = [
  "Save",
  "Save as...",
  "Download TeX",
  "Download PDF",
  "Back to Project",
  "My workspace",
];


const texInsertMenuItems = [
  "見出し",
  "箇条書き",
  "参照・引用",
  "文書構造",
  "配置・引用環境",
  "そのまま出力",
  "figure / table",
  "theorem / proof",
  "日本語 TeX preamble",
];

const mathMenuItems = [
  "数式モード",
  "分数・根号・添字",
  "ギリシャ文字",
  "数学関数",
  "和・積分記号等",
  "演算子",
  "関係子",
  "数学記号",
  "矢印",
  "括弧・区切り",
  "アクセント・装飾",
  "cases / matrix",
];

const mathModeMenuItems = [
  {
    label: "文中に挿入 / $...$",
    snippet: "$%%CURSOR%%$",
  },
  {
    label: "1行出力 / \\[...\\]",
    snippet: "\\\[\n%%CURSOR%%\n\\\]",
  },
  {
    label: "1行出力番号付き / equation 環境",
    snippet: "\\begin{equation}\n%%CURSOR%%\n\\end{equation}",
  },
  {
    label: "複数行番号なし / align* 環境",
    snippet: "\\begin{align*}\n%%CURSOR%%\n\\end{align*}",
  },
  {
    label: "複数行番号付き / align 環境",
    snippet: "\\begin{align}\n%%CURSOR%%\n\\end{align}",
  },
];

const fracRootSubscriptMenuItems = [
  {
    label: "分数 / \\frac{}{}",
    snippet: "\\frac{%%CURSOR%%}{}",
  },
  {
    label: "平方根 / \\sqrt{}",
    snippet: "\\sqrt{%%CURSOR%%}",
  },
  {
    label: "n 乗根 / \\sqrt[]{}",
    snippet: "\\sqrt[]{%%CURSOR%%}",
  },
  {
    label: "下付き / _{}",
    snippet: "_{%%CURSOR%%}",
  },
  {
    label: "上付き / ^{}",
    snippet: "^{%%CURSOR%%}",
  },
  {
    label: "上下付き / _{}^{}",
    snippet: "_{%%CURSOR%%}^{}",
  },
];

const greekMenuItems = [
  { label: "α  \\alpha", snippet: "\\alpha" },
  { label: "β  \\beta", snippet: "\\beta" },
  { label: "γ  \\gamma", snippet: "\\gamma" },
  { label: "δ  \\delta", snippet: "\\delta" },
  { label: "ε  \\epsilon", snippet: "\\epsilon" },
  { label: "ε  \\varepsilon", snippet: "\\varepsilon" },
  { label: "ζ  \\zeta", snippet: "\\zeta" },
  { label: "η  \\eta", snippet: "\\eta" },
  { label: "θ  \\theta", snippet: "\\theta" },
  { label: "ϑ  \\vartheta", snippet: "\\vartheta" },
  { label: "ι  \\iota", snippet: "\\iota" },
  { label: "κ  \\kappa", snippet: "\\kappa" },
  { label: "λ  \\lambda", snippet: "\\lambda" },
  { label: "μ  \\mu", snippet: "\\mu" },
  { label: "ν  \\nu", snippet: "\\nu" },
  { label: "ξ  \\xi", snippet: "\\xi" },
  { label: "ο  o", snippet: "o" },
  { label: "π  \\pi", snippet: "\\pi" },
  { label: "ϖ  \\varpi", snippet: "\\varpi" },
  { label: "ρ  \\rho", snippet: "\\rho" },
  { label: "ϱ  \\varrho", snippet: "\\varrho" },
  { label: "σ  \\sigma", snippet: "\\sigma" },
  { label: "ς  \\varsigma", snippet: "\\varsigma" },
  { label: "τ  \\tau", snippet: "\\tau" },
  { label: "υ  \\upsilon", snippet: "\\upsilon" },
  { label: "φ  \\phi", snippet: "\\phi" },
  { label: "φ  \\varphi", snippet: "\\varphi" },
  { label: "χ  \\chi", snippet: "\\chi" },
  { label: "ψ  \\psi", snippet: "\\psi" },
  { label: "ω  \\omega", snippet: "\\omega" },
  { label: "Γ  \\Gamma", snippet: "\\Gamma" },
  { label: "Δ  \\Delta", snippet: "\\Delta" },
  { label: "Θ  \\Theta", snippet: "\\Theta" },
  { label: "Λ  \\Lambda", snippet: "\\Lambda" },
  { label: "Ξ  \\Xi", snippet: "\\Xi" },
  { label: "Π  \\Pi", snippet: "\\Pi" },
  { label: "Σ  \\Sigma", snippet: "\\Sigma" },
  { label: "Υ  \\Upsilon", snippet: "\\Upsilon" },
  { label: "Φ  \\Phi", snippet: "\\Phi" },
  { label: "Ψ  \\Psi", snippet: "\\Psi" },
  { label: "Ω  \\Omega", snippet: "\\Omega" },
];

const mathFunctionMenuItems = [
  { label: "arccos  \\arccos", snippet: "\\arccos %%CURSOR%%" },
  { label: "arcsin  \\arcsin", snippet: "\\arcsin %%CURSOR%%" },
  { label: "arctan  \\arctan", snippet: "\\arctan %%CURSOR%%" },
  { label: "arg  \\arg", snippet: "\\arg %%CURSOR%%" },
  { label: "cos  \\cos", snippet: "\\cos %%CURSOR%%" },
  { label: "cosh  \\cosh", snippet: "\\cosh %%CURSOR%%" },
  { label: "cot  \\cot", snippet: "\\cot %%CURSOR%%" },
  { label: "coth  \\coth", snippet: "\\coth %%CURSOR%%" },
  { label: "csc  \\csc", snippet: "\\csc %%CURSOR%%" },
  { label: "deg  \\deg", snippet: "\\deg %%CURSOR%%" },
  { label: "det  \\det", snippet: "\\det %%CURSOR%%" },
  { label: "dim  \\dim", snippet: "\\dim %%CURSOR%%" },
  { label: "exp  \\exp", snippet: "\\exp %%CURSOR%%" },
  { label: "gcd  \\gcd", snippet: "\\gcd %%CURSOR%%" },
  { label: "hom  \\hom", snippet: "\\hom %%CURSOR%%" },
  { label: "inf  \\inf", snippet: "\\inf %%CURSOR%%" },
  { label: "ker  \\ker", snippet: "\\ker %%CURSOR%%" },
  { label: "lg  \\lg", snippet: "\\lg %%CURSOR%%" },
  { label: "lim  \\lim", snippet: "\\lim %%CURSOR%%" },
  { label: "liminf  \\liminf", snippet: "\\liminf %%CURSOR%%" },
  { label: "limsup  \\limsup", snippet: "\\limsup %%CURSOR%%" },
  { label: "ln  \\ln", snippet: "\\ln %%CURSOR%%" },
  { label: "log  \\log", snippet: "\\log %%CURSOR%%" },
  { label: "max  \\max", snippet: "\\max %%CURSOR%%" },
  { label: "min  \\min", snippet: "\\min %%CURSOR%%" },
  { label: "Pr  \\Pr", snippet: "\\Pr %%CURSOR%%" },
  { label: "sec  \\sec", snippet: "\\sec %%CURSOR%%" },
  { label: "sin  \\sin", snippet: "\\sin %%CURSOR%%" },
  { label: "sinh  \\sinh", snippet: "\\sinh %%CURSOR%%" },
  { label: "sup  \\sup", snippet: "\\sup %%CURSOR%%" },
  { label: "tan  \\tan", snippet: "\\tan %%CURSOR%%" },
  { label: "tanh  \\tanh", snippet: "\\tanh %%CURSOR%%" },
];

const sumIntegralMenuItems = [
  { label: "∫  \\int", snippet: "\\int %%CURSOR%%" },
  { label: "∮  \\oint", snippet: "\\oint %%CURSOR%%" },
  { label: "∑  \\sum", snippet: "\\sum %%CURSOR%%" },
  { label: "∏  \\prod", snippet: "\\prod %%CURSOR%%" },
  { label: "∐  \\coprod", snippet: "\\coprod %%CURSOR%%" },
  { label: "⋂  \\bigcap", snippet: "\\bigcap %%CURSOR%%" },
  { label: "⋃  \\bigcup", snippet: "\\bigcup %%CURSOR%%" },
  { label: "⋀  \\bigwedge", snippet: "\\bigwedge %%CURSOR%%" },
  { label: "⋁  \\bigvee", snippet: "\\bigvee %%CURSOR%%" },
];

const casesMatrixMenuItems = [
  {
    label: "cases",
    snippet: `\\begin{cases}
%%CURSOR%%, & \\text{if } \\\\
, & \\text{otherwise}
\\end{cases}`,
  },
  {
    label: "pmatrix 2x2",
    snippet: `\\begin{pmatrix}
%%CURSOR%% &  \\\\
 & 
\\end{pmatrix}`,
  },
  {
    label: "pmatrix 3x3",
    snippet: `\\begin{pmatrix}
%%CURSOR%% &  &  \\\\
 &  &  \\\\
 &  & 
\\end{pmatrix}`,
  },
  {
    label: "bmatrix 2x2",
    snippet: `\\begin{bmatrix}
%%CURSOR%% &  \\\\
 & 
\\end{bmatrix}`,
  },
  {
    label: "bmatrix 3x3",
    snippet: `\\begin{bmatrix}
%%CURSOR%% &  &  \\\\
 &  &  \\\\
 &  & 
\\end{bmatrix}`,
  },
  {
    label: "matrix 2x2",
    snippet: `\\begin{matrix}
%%CURSOR%% &  \\\\
 & 
\\end{matrix}`,
  },
  {
    label: "vmatrix 2x2",
    snippet: `\\begin{vmatrix}
%%CURSOR%% &  \\\\
 & 
\\end{vmatrix}`,
  },
  {
    label: "Vmatrix 2x2",
    snippet: `\\begin{Vmatrix}
%%CURSOR%% &  \\\\
 & 
\\end{Vmatrix}`,
  },
];

const figureTableMenuItems = [
  {
    label: "figure + includegraphics",
    snippet: `\\begin{figure}[htbp]
  \\centering
  \\includegraphics[width=0.8\\linewidth]{%%CURSOR%%}
  \\caption{}
  \\label{fig:}
\\end{figure}`,
  },
  {
    label: "includegraphics only",
    snippet: "\\includegraphics[width=0.8\\\\linewidth]{%%CURSOR%%}",
  },
  {
    label: "table 2x2",
    snippet: `\\begin{table}[htbp]
  \\centering
  \\caption{}
  \\label{tab:}
  \\begin{tabular}{cc}
    \\hline
    %%CURSOR%% &  \\\\
    \\hline
     &  \\\\
    \\hline
  \\end{tabular}
\\end{table}`,
  },
  {
    label: "table 3 columns",
    snippet: `\\begin{table}[htbp]
  \\centering
  \\caption{}
  \\label{tab:}
  \\begin{tabular}{ccc}
    \\hline
    %%CURSOR%% &  &  \\\\
    \\hline
     &  &  \\\\
    \\hline
  \\end{tabular}
\\end{table}`,
  },
  {
    label: "tabular 2x2 only",
    snippet: `\\begin{tabular}{cc}
  \\hline
  %%CURSOR%% &  \\\\
  \\hline
   &  \\\\
  \\hline
\\end{tabular}`,
  },
  {
    label: "tabular 3 columns only",
    snippet: `\\begin{tabular}{ccc}
  \\hline
  %%CURSOR%% &  &  \\\\
  \\hline
   &  &  \\\\
  \\hline
\\end{tabular}`,
  },
];

const theoremProofMenuItems = [
  {
    label: "amsthm + theorem 定義",
    snippet: `\\usepackage{amsthm}

\\theoremstyle{plain}
\\newtheorem{theorem}{Theorem}
\\newtheorem{lemma}{Lemma}
\\newtheorem{proposition}{Proposition}
\\newtheorem{corollary}{Corollary}

\\theoremstyle{definition}
\\newtheorem{definition}{Definition}
\\newtheorem{example}{Example}

\\theoremstyle{remark}
\\newtheorem{remark}{Remark}
%%CURSOR%%`,
  },
  {
    label: "theorem",
    snippet: `\\begin{theorem}
%%CURSOR%%
\\end{theorem}`,
  },
  {
    label: "lemma",
    snippet: `\\begin{lemma}
%%CURSOR%%
\\end{lemma}`,
  },
  {
    label: "proposition",
    snippet: `\\begin{proposition}
%%CURSOR%%
\\end{proposition}`,
  },
  {
    label: "corollary",
    snippet: `\\begin{corollary}
%%CURSOR%%
\\end{corollary}`,
  },
  {
    label: "definition",
    snippet: `\\begin{definition}
%%CURSOR%%
\\end{definition}`,
  },
  {
    label: "example",
    snippet: `\\begin{example}
%%CURSOR%%
\\end{example}`,
  },
  {
    label: "remark",
    snippet: `\\begin{remark}
%%CURSOR%%
\\end{remark}`,
  },
  {
    label: "proof",
    snippet: `\\begin{proof}
%%CURSOR%%
\\end{proof}`,
  },
];

const japanesePreambleMenuItems = [
  {
    label: "LuaLaTeX 日本語標準",
    snippet: `\\documentclass[a4paper,11pt]{ltjsarticle}

%%CURSOR%%`,
  },
  {
    label: "LuaLaTeX 数学・図表",
    snippet: `\\documentclass[a4paper,11pt]{ltjsarticle}

\\usepackage{amsmath,amssymb,mathtools}
\\usepackage{graphicx}
\\usepackage{booktabs}
\\usepackage{hyperref}

%%CURSOR%%`,
  },
  {
    label: "LuaLaTeX 定理環境付き",
    snippet: `\\documentclass[a4paper,11pt]{ltjsarticle}

\\usepackage{amsmath,amssymb,mathtools}
\\usepackage{amsthm}

\\theoremstyle{plain}
\\newtheorem{theorem}{Theorem}
\\newtheorem{lemma}{Lemma}
\\newtheorem{proposition}{Proposition}
\\newtheorem{corollary}{Corollary}

\\theoremstyle{definition}
\\newtheorem{definition}{Definition}
\\newtheorem{example}{Example}

\\theoremstyle{remark}
\\newtheorem{remark}{Remark}

%%CURSOR%%`,
  },
  {
    label: "日本語レポート雛形",
    snippet: `\\documentclass[a4paper,11pt]{ltjsarticle}

\\usepackage{amsmath,amssymb,mathtools}
\\usepackage{graphicx}
\\usepackage{booktabs}
\\usepackage{hyperref}

\\title{}
\\author{}
\\date{\\today}

\\begin{document}

\\maketitle

%%CURSOR%%

\\end{document}`,
  },
];

const mathSymbolMenuItems = [
  { label: "±  \\pm", snippet: "\\pm" },
  { label: "∓  \\mp", snippet: "\\mp" },
  { label: "×  \\times", snippet: "\\times" },
  { label: "÷  \\div", snippet: "\\div" },
  { label: "·  \\cdot", snippet: "\\cdot" },
  { label: "∗  \\ast", snippet: "\\ast" },
  { label: "⋆  \\star", snippet: "\\star" },
  { label: "∘  \\circ", snippet: "\\circ" },

  { label: "≤  \\le", snippet: "\\le" },
  { label: "≥  \\ge", snippet: "\\ge" },
  { label: "≠  \\ne", snippet: "\\ne" },
  { label: "≈  \\approx", snippet: "\\approx" },
  { label: "∼  \\sim", snippet: "\\sim" },
  { label: "≃  \\simeq", snippet: "\\simeq" },
  { label: "≡  \\equiv", snippet: "\\equiv" },
  { label: "∝  \\propto", snippet: "\\propto" },

  { label: "∈  \\in", snippet: "\\in" },
  { label: "∉  \\notin", snippet: "\\notin" },
  { label: "⊂  \\subset", snippet: "\\subset" },
  { label: "⊆  \\subseteq", snippet: "\\subseteq" },
  { label: "⊃  \\supset", snippet: "\\supset" },
  { label: "⊇  \\supseteq", snippet: "\\supseteq" },
  { label: "∪  \\cup", snippet: "\\cup" },
  { label: "∩  \\cap", snippet: "\\cap" },

  { label: "∅  \\emptyset", snippet: "\\emptyset" },
  { label: "∀  \\forall", snippet: "\\forall" },
  { label: "∃  \\exists", snippet: "\\exists" },
  { label: "¬  \\neg", snippet: "\\neg" },
  { label: "∧  \\wedge", snippet: "\\wedge" },
  { label: "∨  \\vee", snippet: "\\vee" },
  { label: "∞  \\infty", snippet: "\\infty" },
  { label: "∂  \\partial", snippet: "\\partial" },

  { label: "∇  \\nabla", snippet: "\\nabla" },
  { label: "ℓ  \\ell", snippet: "\\ell" },
  { label: "ℜ  \\Re", snippet: "\\Re" },
  { label: "ℑ  \\Im", snippet: "\\Im" },
];

const arrowMenuItems = [
  { label: "→  \\to", snippet: "\\to" },
  { label: "→  \\rightarrow", snippet: "\\rightarrow" },
  { label: "←  \\leftarrow", snippet: "\\leftarrow" },
  { label: "↔  \\leftrightarrow", snippet: "\\leftrightarrow" },
  { label: "↦  \\mapsto", snippet: "\\mapsto" },
  { label: "⇒  \\Rightarrow", snippet: "\\Rightarrow" },
  { label: "⇐  \\Leftarrow", snippet: "\\Leftarrow" },
  { label: "⇔  \\Leftrightarrow", snippet: "\\Leftrightarrow" },

  { label: "↣  \\hookrightarrow", snippet: "\\hookrightarrow" },
  { label: "↢  \\hookleftarrow", snippet: "\\hookleftarrow" },
  { label: "↪  \\rightarrowtail", snippet: "\\rightarrowtail" },
  { label: "↠  \\twoheadrightarrow", snippet: "\\twoheadrightarrow" },
  { label: "↗  \\nearrow", snippet: "\\nearrow" },
  { label: "↘  \\searrow", snippet: "\\searrow" },
  { label: "↙  \\swarrow", snippet: "\\swarrow" },
  { label: "↖  \\nwarrow", snippet: "\\nwarrow" },

  { label: "↑  \\uparrow", snippet: "\\uparrow" },
  { label: "↓  \\downarrow", snippet: "\\downarrow" },
  { label: "↕  \\updownarrow", snippet: "\\updownarrow" },
  { label: "⇑  \\Uparrow", snippet: "\\Uparrow" },
  { label: "⇓  \\Downarrow", snippet: "\\Downarrow" },
  { label: "⇕  \\Updownarrow", snippet: "\\Updownarrow" },

  { label: "⟶  \\longrightarrow", snippet: "\\longrightarrow" },
  { label: "⟵  \\longleftarrow", snippet: "\\longleftarrow" },
  { label: "⟷  \\longleftrightarrow", snippet: "\\longleftrightarrow" },
  { label: "⟹  \\Longrightarrow", snippet: "\\Longrightarrow" },
  { label: "⟸  \\Longleftarrow", snippet: "\\Longleftarrow" },
  { label: "⟺  \\Longleftrightarrow", snippet: "\\Longleftrightarrow" },
];

const operatorMenuItems = [
  { label: "×  \\times", snippet: "\\times" },
  { label: "÷  \\div", snippet: "\\div" },
  { label: "∗  \\ast", snippet: "\\ast" },
  { label: "⋆  \\star", snippet: "\\star" },
  { label: "±  \\pm", snippet: "\\pm" },
  { label: "∓  \\mp", snippet: "\\mp" },

  { label: "∘  \\circ", snippet: "\\circ" },
  { label: "∙  \\bullet", snippet: "\\bullet" },
  { label: "·  \\cdot", snippet: "\\cdot" },
  { label: "∩  \\cap", snippet: "\\cap" },
  { label: "∪  \\cup", snippet: "\\cup" },
  { label: "⊎  \\uplus", snippet: "\\uplus" },

  { label: "⊓  \\sqcap", snippet: "\\sqcap" },
  { label: "⊔  \\sqcup", snippet: "\\sqcup" },
  { label: "∨  \\vee", snippet: "\\vee" },
  { label: "∧  \\wedge", snippet: "\\wedge" },
  { label: "\\  \\setminus", snippet: "\\setminus" },
  { label: "≀  \\wr", snippet: "\\wr" },

  { label: "◇  \\diamond", snippet: "\\diamond" },
  { label: "△  \\bigtriangleup", snippet: "\\bigtriangleup" },
  { label: "▽  \\bigtriangledown", snippet: "\\bigtriangledown" },
  { label: "◁  \\triangleleft", snippet: "\\triangleleft" },
  { label: "▷  \\triangleright", snippet: "\\triangleright" },
  { label: "⊕  \\oplus", snippet: "\\oplus" },

  { label: "⊖  \\ominus", snippet: "\\ominus" },
  { label: "⊗  \\otimes", snippet: "\\otimes" },
  { label: "⊘  \\oslash", snippet: "\\oslash" },
  { label: "⊙  \\odot", snippet: "\\odot" },
  { label: "○  \\bigcirc", snippet: "\\bigcirc" },
  { label: "†  \\dagger", snippet: "\\dagger" },

  { label: "‡  \\ddagger", snippet: "\\ddagger" },
  { label: "∐  \\amalg", snippet: "\\amalg" },
];

const relationMenuItems = [
  { label: "≤  \\le", snippet: "\\le" },
  { label: "≥  \\ge", snippet: "\\ge" },
  { label: "≪  \\ll", snippet: "\\ll" },
  { label: "≫  \\gg", snippet: "\\gg" },
  { label: "⊂  \\subset", snippet: "\\subset" },
  { label: "⊃  \\supset", snippet: "\\supset" },

  { label: "⊆  \\subseteq", snippet: "\\subseteq" },
  { label: "⊇  \\supseteq", snippet: "\\supseteq" },
  { label: "⊑  \\sqsubseteq", snippet: "\\sqsubseteq" },
  { label: "⊒  \\sqsupseteq", snippet: "\\sqsupseteq" },
  { label: "≺  \\prec", snippet: "\\prec" },
  { label: "≻  \\succ", snippet: "\\succ" },

  { label: "⪯  \\preceq", snippet: "\\preceq" },
  { label: "⪰  \\succeq", snippet: "\\succeq" },
  { label: "∈  \\in", snippet: "\\in" },
  { label: "∉  \\notin", snippet: "\\notin" },
  { label: "∋  \\ni", snippet: "\\ni" },
  { label: "⊢  \\vdash", snippet: "\\vdash" },

  { label: "⊣  \\dashv", snippet: "\\dashv" },
  { label: "⌣  \\smile", snippet: "\\smile" },
  { label: "⌢  \\frown", snippet: "\\frown" },
  { label: "≠  \\ne", snippet: "\\ne" },
  { label: "≐  \\doteq", snippet: "\\doteq" },
  { label: "∝  \\propto", snippet: "\\propto" },

  { label: "≡  \\equiv", snippet: "\\equiv" },
  { label: "∼  \\sim", snippet: "\\sim" },
  { label: "≃  \\simeq", snippet: "\\simeq" },
  { label: "≈  \\approx", snippet: "\\approx" },
  { label: "≅  \\cong", snippet: "\\cong" },
  { label: "⊥  \\perp", snippet: "\\perp" },

  { label: "|  \\mid", snippet: "\\mid" },
  { label: "∥  \\parallel", snippet: "\\parallel" },
];

const delimiterMenuItems = [
  { label: "( )", snippet: "(%%CURSOR%%)" },
  { label: "[ ]", snippet: "[%%CURSOR%%]" },
  { label: "{ }", snippet: "\\{%%CURSOR%%\\}" },
  { label: "| |", snippet: "|%%CURSOR%%|" },
  { label: "|| ||", snippet: "\\|%%CURSOR%%\\|" },

  { label: "\\left( \\right)", snippet: "\\left( %%CURSOR%% \\right)" },
  { label: "\\left[ \\right]", snippet: "\\left[ %%CURSOR%% \\right]" },
  { label: "\\left\\{ \\right\\}", snippet: "\\left\\{ %%CURSOR%% \\right\\}" },
  { label: "\\left| \\right|", snippet: "\\left| %%CURSOR%% \\right|" },
  { label: "\\left\\| \\right\\|", snippet: "\\left\\| %%CURSOR%% \\right\\|" },

  { label: "\\langle \\rangle", snippet: "\\left\\langle %%CURSOR%% \\right\\rangle" },
  { label: "\\lfloor \\rfloor", snippet: "\\left\\lfloor %%CURSOR%% \\right\\rfloor" },
  { label: "\\lceil \\rceil", snippet: "\\left\\lceil %%CURSOR%% \\right\\rceil" },
];

const accentMenuItems = [
  { label: "\\hat{}", snippet: "\\hat{%%CURSOR%%}" },
  { label: "\\widehat{}", snippet: "\\widehat{%%CURSOR%%}" },
  { label: "\\bar{}", snippet: "\\bar{%%CURSOR%%}" },
  { label: "\\overline{}", snippet: "\\overline{%%CURSOR%%}" },
  { label: "\\tilde{}", snippet: "\\tilde{%%CURSOR%%}" },
  { label: "\\widetilde{}", snippet: "\\widetilde{%%CURSOR%%}" },
  { label: "\\dot{}", snippet: "\\dot{%%CURSOR%%}" },
  { label: "\\ddot{}", snippet: "\\ddot{%%CURSOR%%}" },
  { label: "\\vec{}", snippet: "\\vec{%%CURSOR%%}" },
  { label: "\\overrightarrow{}", snippet: "\\overrightarrow{%%CURSOR%%}" },

  { label: "\\mathrm{}", snippet: "\\mathrm{%%CURSOR%%}" },
  { label: "\\mathbf{}", snippet: "\\mathbf{%%CURSOR%%}" },
  { label: "\\mathsf{}", snippet: "\\mathsf{%%CURSOR%%}" },
  { label: "\\mathtt{}", snippet: "\\mathtt{%%CURSOR%%}" },
  { label: "\\mathcal{}", snippet: "\\mathcal{%%CURSOR%%}" },
  { label: "\\boldsymbol{}", snippet: "\\boldsymbol{%%CURSOR%%}" },
  { label: "\\operatorname{}", snippet: "\\operatorname{%%CURSOR%%}" },
];

const headingMenuItems = [
  { label: "\\section{}", snippet: "\\section{%%CURSOR%%}" },
  { label: "\\subsection{}", snippet: "\\subsection{%%CURSOR%%}" },
  { label: "\\subsubsection{}", snippet: "\\subsubsection{%%CURSOR%%}" },
  { label: "\\paragraph{}", snippet: "\\paragraph{%%CURSOR%%}" },
  { label: "\\section*{}", snippet: "\\section*{%%CURSOR%%}" },
  { label: "\\subsection*{}", snippet: "\\subsection*{%%CURSOR%%}" },
];

const listMenuItems = [
  {
    label: "itemize",
    snippet: `\\begin{itemize}
  \\item %%CURSOR%%
\\end{itemize}`,
  },
  {
    label: "itemize 2 items",
    snippet: `\\begin{itemize}
  \\item %%CURSOR%%
  \\item 
\\end{itemize}`,
  },
  {
    label: "enumerate",
    snippet: `\\begin{enumerate}
  \\item %%CURSOR%%
\\end{enumerate}`,
  },
  {
    label: "enumerate 2 items",
    snippet: `\\begin{enumerate}
  \\item %%CURSOR%%
  \\item 
\\end{enumerate}`,
  },
  {
    label: "description",
    snippet: `\\begin{description}
  \\item[%%CURSOR%%] 
\\end{description}`,
  },
  {
    label: "\\item",
    snippet: "\\item %%CURSOR%%",
  },
];

const referenceMenuItems = [
  { label: "ラベル / \\label{}", snippet: "\\label{%%CURSOR%%}" },
  { label: "参照 / \\ref{}", snippet: "\\ref{%%CURSOR%%}" },
  { label: "数式 / \\eqref{}", snippet: "\\eqref{%%CURSOR%%}" },
  { label: "ページ / \\pageref{}", snippet: "\\pageref{%%CURSOR%%}" },
  { label: "文献 / \\cite{}", snippet: "\\cite{%%CURSOR%%}" },
  {
    label: "文献リスト / thebibliography",
    snippet: `\\begin{thebibliography}{99}
\\bibitem{%%CURSOR%%}

\\end{thebibliography}`,
  },
  { label: "脚注 / \\footnote{}", snippet: "\\footnote{%%CURSOR%%}" },
];

const documentStructureMenuItems = [
  { label: "\\title{}", snippet: "\\title{%%CURSOR%%}" },
  { label: "\\author{}", snippet: "\\author{%%CURSOR%%}" },
  { label: "\\date{\\today}", snippet: "\\date{\\today}" },
  { label: "\\maketitle", snippet: "\\maketitle\n%%CURSOR%%" },
  { label: "\\tableofcontents", snippet: "\\tableofcontents\n%%CURSOR%%" },
  { label: "\\appendix", snippet: "\\appendix\n%%CURSOR%%" },
  { label: "\\newpage", snippet: "\\newpage\n%%CURSOR%%" },
  { label: "\\clearpage", snippet: "\\clearpage\n%%CURSOR%%" },
  {
    label: "abstract",
    snippet: `\\begin{abstract}
%%CURSOR%%
\\end{abstract}`,
  },
];

const placementQuoteMenuItems = [
  {
    label: "中央 / center",
    snippet: `\\begin{center}
%%CURSOR%%
\\end{center}`,
  },
  {
    label: "左寄せ / flushleft",
    snippet: `\\begin{flushleft}
%%CURSOR%%
\\end{flushleft}`,
  },
  {
    label: "右寄せ / flushright",
    snippet: `\\begin{flushright}
%%CURSOR%%
\\end{flushright}`,
  },
  {
    label: "引用 / quote",
    snippet: `\\begin{quote}
%%CURSOR%%
\\end{quote}`,
  },
  {
    label: "長い引用 / quotation",
    snippet: `\\begin{quotation}
%%CURSOR%%
\\end{quotation}`,
  },
  {
    label: "ミニページ / minipage",
    snippet: `\\begin{minipage}{0.9\\linewidth}
%%CURSOR%%
\\end{minipage}`,
  },
];

const rawOutputMenuItems = [
  {
    label: "複数行 / verbatim",
    snippet: `\\begin{verbatim}
%%CURSOR%%
\\end{verbatim}`,
  },
  {
    label: "行内 / \\verb|...|",
    snippet: "\\verb|%%CURSOR%%|",
  },
  {
    label: "フォント / \\texttt{}",
    snippet: "\\texttt{%%CURSOR%%}",
  },
];

const INSERT_SNIPPET_EVENT = "freeslotex:insert-snippet";
const SET_EDITOR_FONT_SIZE_EVENT = "freeslotex:set-editor-font-size";
const SET_SOFT_WRAP_EVENT = "freeslotex:set-soft-wrap";

type MenuPosition = {
  top: number;
  left: number;
};

export default function ProjectsTopMenu() {
  const [openMenu, setOpenMenu] = useState<string | null>(null);
  const [activeSubmenu, setActiveSubmenu] = useState<string | null>(null);
  const [viewEditorFontSize, setViewEditorFontSize] = useState(14);
  const [viewSoftWrap, setViewSoftWrap] = useState(false);
  const [menuPosition, setMenuPosition] = useState<MenuPosition>({ top: 42, left: 180 });
  const [submenuPosition, setSubmenuPosition] = useState<MenuPosition>({ top: 42, left: 420 });
  const menuRootRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (openMenu === null) return;

    function handlePointerDown(event: PointerEvent) {
      const target = event.target;
      if (target instanceof Node && menuRootRef.current?.contains(target)) return;
      setOpenMenu(null);
      setActiveSubmenu(null);
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setOpenMenu(null);
      }
    }

    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [openMenu]);

  function refreshViewPreferences() {
    try {
      const rawFontSize = window.localStorage.getItem("freeslotex.editorFontSize");
      const parsedFontSize = Number(rawFontSize);

      if ([12, 14, 16, 18, 20, 22, 24].includes(parsedFontSize)) {
        setViewEditorFontSize(parsedFontSize);
      } else {
        setViewEditorFontSize(14);
      }

      const rawSoftWrap = window.localStorage.getItem("freeslotex.softWrap");
      setViewSoftWrap(rawSoftWrap === "1");
    } catch {
      setViewEditorFontSize(14);
      setViewSoftWrap(false);
    }
  }

  function handleMenuClick(item: string, event: MouseEvent<HTMLButtonElement>) {
    if (item !== "File" && item !== "View" && item !== "TeX Insert" && item !== "Math") {
      setOpenMenu(null);
      setActiveSubmenu(null);
      return;
    }

    if (item === "View") {
      refreshViewPreferences();
    }

    const rect = event.currentTarget.getBoundingClientRect();
    setMenuPosition({
      top: rect.bottom + 6,
      left: rect.left,
    });

    setActiveSubmenu(null);
    setOpenMenu((current) => (current === item ? null : item));
  }

  function triggerExistingSaveAsFromFileMenu() {
    setOpenMenu(null);
    setActiveSubmenu(null);

    const button = document.querySelector<HTMLButtonElement>(".fsx-save-as-inline");

    if (!button) {
      window.alert("Save as... button was not found. Please use the existing toolbar button.");
      return;
    }

    if (button.disabled) {
      window.alert("Save as... is currently unavailable.");
      return;
    }

    button.click();
  }

  async function downloadMainTexFromFileMenu() {
    const match = window.location.pathname.match(/^\/projects\/([^/]+)/);
    const projectId = match?.[1];

    setOpenMenu(null);
    setActiveSubmenu(null);

    if (!projectId) {
      window.location.href = "/projects";
      return;
    }

    const encodedProjectId = encodeURIComponent(projectId);
    const encodedFileName = encodeURIComponent("main.tex");
    const readUrls = [
      `/api/projects/${encodedProjectId}/files/read?path=${encodedFileName}`,
      `/api/projects/${encodedProjectId}/files/read?relativePath=${encodedFileName}`,
      `/api/projects/${encodedProjectId}/files/read?file=${encodedFileName}`,
    ];

    let content = "";

    for (const readUrl of readUrls) {
      try {
        const response = await fetch(readUrl, { cache: "no-store" });
        if (!response.ok) continue;

        const data = (await response.json()) as {
          content?: unknown;
          text?: unknown;
          file?: {
            content?: unknown;
            text?: unknown;
          };
        };

        const candidate =
          typeof data.content === "string"
            ? data.content
            : typeof data.text === "string"
              ? data.text
              : typeof data.file?.content === "string"
                ? data.file.content
                : typeof data.file?.text === "string"
                  ? data.file.text
                  : "";

        if (candidate) {
          content = candidate;
          break;
        }
      } catch {
        // Try the next compatible query shape.
      }
    }

    if (!content) {
      window.alert("Could not download main.tex. Please use the existing Download TeX button.");
      return;
    }

    const blob = new Blob([content], { type: "application/x-tex;charset=utf-8" });
    const objectUrl = window.URL.createObjectURL(blob);
    const anchor = document.createElement("a");

    anchor.href = objectUrl;
    anchor.download = "main.tex";
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    window.URL.revokeObjectURL(objectUrl);
  }

  function downloadMainPdfFromFileMenu() {
    const match = window.location.pathname.match(/^\/projects\/([^/]+)/);
    const projectId = match?.[1];

    setOpenMenu(null);
    setActiveSubmenu(null);

    if (!projectId) {
      window.location.href = "/projects";
      return;
    }

    const anchor = document.createElement("a");
    anchor.href = `/api/projects/${encodeURIComponent(projectId)}/pdf?file=main.pdf`;
    anchor.download = "main.pdf";
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
  }

  function openCurrentProjectFromFileMenu() {
    const match = window.location.pathname.match(/^\/projects\/([^/]+)/);
    const projectId = match?.[1];

    setOpenMenu(null);
    setActiveSubmenu(null);

    if (!projectId) {
      window.location.href = "/projects";
      return;
    }

    window.location.href = `/projects/${projectId}`;
  }

  return (
    <nav ref={menuRootRef} className="fsx-editor-menubar" aria-label="FreeSloTeX editor menu">
      {editorMenuItems.map((item) => {
        const hasDropdown = item === "File" || item === "View" || item === "TeX Insert" || item === "Math";

        return (
          <button
            key={item}
            type="button"
            className="fsx-editor-menuitem"
            onClick={(event) => handleMenuClick(item, event)}
            aria-haspopup={hasDropdown ? "menu" : undefined}
            aria-expanded={hasDropdown ? openMenu === item : undefined}
            style={{
              border: 0,
              background: "transparent",
              font: "inherit",
            }}
          >
            {item}
          </button>
        );
      })}

      {openMenu === "File" ? (
        <div
          role="menu"
          aria-label="File menu"
          style={{
            position: "fixed",
            top: menuPosition.top,
            left: menuPosition.left,
            zIndex: 2147483647,
            display: "flex",
            minWidth: 210,
            flexDirection: "column",
            gap: 2,
            padding: 6,
            border: "1px solid #cbd5e1",
            borderRadius: 10,
            background: "#ffffff",
            boxShadow: "0 12px 28px rgba(15, 23, 42, 0.16)",
          }}
        >
          {fileMenuItems.map((label, index) => {
            if (label === "Save as...") {
              return (
                <button
                  key={`${label}-${index}`}
                  type="button"
                  role="menuitem"
                  title="Use the existing Save as... action."
                  onClick={triggerExistingSaveAsFromFileMenu}
                  style={{
                    display: "block",
                    width: "100%",
                    padding: "7px 10px",
                    border: 0,
                    borderRadius: 8,
                    background: "transparent",
                    color: "#334155",
                    cursor: "pointer",
                    fontSize: 13,
                    fontWeight: 500,
                    textAlign: "left",
                  }}
                >
                  {label}
                </button>
              );
            }

            if (label === "Download TeX") {
              return (
                <button
                  key={`${label}-${index}`}
                  type="button"
                  role="menuitem"
                  title="Download main.tex."
                  onClick={() => {
                    void downloadMainTexFromFileMenu();
                  }}
                  style={{
                    display: "block",
                    width: "100%",
                    padding: "7px 10px",
                    border: 0,
                    borderRadius: 8,
                    background: "transparent",
                    color: "#334155",
                    cursor: "pointer",
                    fontSize: 13,
                    fontWeight: 500,
                    textAlign: "left",
                  }}
                >
                  {label}
                </button>
              );
            }

            if (label === "Download PDF") {
              return (
                <button
                  key={`${label}-${index}`}
                  type="button"
                  role="menuitem"
                  title="Download main.pdf."
                  onClick={downloadMainPdfFromFileMenu}
                  style={{
                    display: "block",
                    width: "100%",
                    padding: "7px 10px",
                    border: 0,
                    borderRadius: 8,
                    background: "transparent",
                    color: "#334155",
                    cursor: "pointer",
                    fontSize: 13,
                    fontWeight: 500,
                    textAlign: "left",
                  }}
                >
                  {label}
                </button>
              );
            }

            if (label === "Back to Project") {
              return (
                <button
                  key={`${label}-${index}`}
                  type="button"
                  role="menuitem"
                  title="Open the current project page."
                  onClick={openCurrentProjectFromFileMenu}
                  style={{
                    display: "block",
                    width: "100%",
                    padding: "7px 10px",
                    border: 0,
                    borderRadius: 8,
                    background: "transparent",
                    color: "#334155",
                    cursor: "pointer",
                    fontSize: 13,
                    fontWeight: 500,
                    textAlign: "left",
                  }}
                >
                  {label}
                </button>
              );
            }

            if (label === "My workspace") {
              return (
                <a
                  key={`${label}-${index}`}
                  href="/workspace"
                  role="menuitem"
                  title="Open My workspace."
                  style={{
                    display: "block",
                    width: "100%",
                    boxSizing: "border-box",
                    padding: "7px 10px",
                    border: 0,
                    borderRadius: 8,
                    background: "transparent",
                    color: "#334155",
                    cursor: "pointer",
                    fontSize: 13,
                    fontWeight: 500,
                    textAlign: "left",
                    textDecoration: "none",
                  }}
                >
                  {label}
                </a>
              );
            }

            return (
              <button
                key={`${label}-${index}`}
                type="button"
                role="menuitem"
                disabled
                title="Not wired yet. Use the existing toolbar button for now."
                style={{
                  display: "block",
                  width: "100%",
                  padding: "7px 10px",
                  border: 0,
                  borderRadius: 8,
                  background: "transparent",
                  color: "#64748b",
                  cursor: "not-allowed",
                  fontSize: 13,
                  fontWeight: 500,
                  textAlign: "left",
                  opacity: 0.72,
                }}
              >
                {label}
              </button>
            );
          })}
        </div>
      ) : null}

      {openMenu === "TeX Insert" ? (
        <div
          role="menu"
          aria-label="TeX Insert menu"
          style={{
            position: "fixed",
            top: menuPosition.top,
            left: menuPosition.left,
            zIndex: 2147483647,
            display: "flex",
            minWidth: 220,
            flexDirection: "column",
            gap: 2,
            padding: 6,
            border: "1px solid #cbd5e1",
            borderRadius: 10,
            background: "#ffffff",
            boxShadow: "0 12px 28px rgba(15, 23, 42, 0.16)",
          }}
        >
          {texInsertMenuItems.map((label) => (
            <button
              key={label}
              type="button"
              role="menuitem"
              onClick={(event) => {
                if (
                  label === "見出し" ||
                  label === "箇条書き" ||
                  label === "参照・引用" ||
                  label === "文書構造" ||
                  label === "配置・引用環境" ||
                  label === "そのまま出力" ||
                  label === "figure / table" ||
                  label === "theorem / proof" ||
                  label === "日本語 TeX preamble"
                ) {
                  const rect = event.currentTarget.getBoundingClientRect();
                  setSubmenuPosition({
                    top: menuPosition.top,
                    left: rect.right + 4,
                  });
                  setActiveSubmenu((current) => (current === label ? null : label));
                  return;
                }

                setOpenMenu(null);
                setActiveSubmenu(null);
              }}
              style={{
                display: "block",
                width: "100%",
                border: 0,
                borderRadius: 7,
                padding: "6px 8px",
                background: label === activeSubmenu ? "#e2e8f0" : "transparent",
                color: label === activeSubmenu ? "#0f172a" : "#334155",
                fontSize: 12,
                fontWeight: label === activeSubmenu ? 700 : 500,
                textAlign: "left",
                whiteSpace: "nowrap",
              }}
            >
              {label}
            </button>
          ))}
        </div>
      ) : null}

      {openMenu === "View" ? (
        <div
          role="menu"
          aria-label="View menu"
          style={{
            position: "fixed",
            top: menuPosition.top,
            left: menuPosition.left,
            zIndex: 2147483647,
            display: "flex",
            minWidth: 220,
            flexDirection: "column",
            gap: 2,
            padding: 6,
            border: "1px solid #cbd5e1",
            borderRadius: 10,
            background: "#ffffff",
            boxShadow: "0 12px 28px rgba(15, 23, 42, 0.16)",
          }}
        >
          <div
            style={{
              padding: "4px 8px",
              color: "#64748b",
              fontSize: 11,
              fontWeight: 700,
            }}
          >
            Font size
          </div>

          {viewFontSizeMenuItems.map((label) => {
            const fontSize = Number(label.replace("px", ""));
            const isActive = viewEditorFontSize === fontSize;

            return (
              <button
                key={label}
                type="button"
                role="menuitem"
                onClick={() => {
                  setViewEditorFontSize(fontSize);
                  window.dispatchEvent(
                    new CustomEvent(SET_EDITOR_FONT_SIZE_EVENT, {
                      detail: { fontSize },
                    }),
                  );
                  setOpenMenu(null);
                  setActiveSubmenu(null);
                }}
                style={{
                  display: "block",
                  width: "100%",
                  border: 0,
                  borderRadius: 7,
                  padding: "6px 8px",
                  background: isActive ? "#dbeafe" : "transparent",
                  color: isActive ? "#1e3a8a" : "#334155",
                  fontSize: 12,
                  fontWeight: isActive ? 700 : 500,
                  textAlign: "left",
                  whiteSpace: "nowrap",
                }}
              >
                {label}
              </button>
            );
          })}

          <div
            style={{
              padding: "6px 8px 4px",
              color: "#64748b",
              fontSize: 11,
              fontWeight: 700,
            }}
          >
            Wrap
          </div>

          {viewWrapMenuItems.map((label) => {
            const softWrap = label === "Wrap On";
            const isActive = viewSoftWrap === softWrap;

            return (
              <button
                key={label}
                type="button"
                role="menuitem"
                onClick={() => {
                  setViewSoftWrap(softWrap);
                  window.dispatchEvent(
                    new CustomEvent(SET_SOFT_WRAP_EVENT, {
                      detail: { softWrap },
                    }),
                  );
                  setOpenMenu(null);
                  setActiveSubmenu(null);
                }}
                style={{
                  display: "block",
                  width: "100%",
                  border: 0,
                  borderRadius: 7,
                  padding: "6px 8px",
                  background: isActive ? "#dbeafe" : "transparent",
                  color: isActive ? "#1e3a8a" : "#334155",
                  fontSize: 12,
                  fontWeight: isActive ? 700 : 500,
                  textAlign: "left",
                  whiteSpace: "nowrap",
                }}
              >
                {label}
              </button>
            );
          })}
        </div>
      ) : null}

      {openMenu === "Math" ? (
        <div
          role="menu"
          aria-label="Math menu"
          style={{
            position: "fixed",
            top: menuPosition.top,
            left: menuPosition.left,
            zIndex: 2147483647,
            display: "flex",
            minWidth: 220,
            flexDirection: "column",
            gap: 2,
            padding: 6,
            border: "1px solid #cbd5e1",
            borderRadius: 10,
            background: "#ffffff",
            boxShadow: "0 12px 28px rgba(15, 23, 42, 0.16)",
          }}
        >
          {mathMenuItems.map((label) => (
            <button
              key={label}
              type="button"
              role="menuitem"
              onClick={(event) => {
                const rect = event.currentTarget.getBoundingClientRect();
                setSubmenuPosition({
                  top: menuPosition.top,
                  left: rect.right + 4,
                });
                setActiveSubmenu((current) => (current === label ? null : label));
              }}
              style={{
                display: "block",
                width: "100%",
                border: 0,
                borderRadius: 7,
                padding: "6px 8px",
                background: label === activeSubmenu ? "#e2e8f0" : "transparent",
                color: label === activeSubmenu ? "#0f172a" : "#334155",
                fontSize: 12,
                fontWeight: label === activeSubmenu ? 700 : 500,
                textAlign: "left",
                whiteSpace: "nowrap",
              }}
            >
              {label}
            </button>
          ))}
        </div>
      ) : null}

      {openMenu === "Math" && activeSubmenu === "数式モード" ? (
        <div
          role="menu"
          aria-label="数式モード menu"
          style={{
            position: "fixed",
            top: submenuPosition.top,
            left: submenuPosition.left,
            zIndex: 2147483647,
            display: "flex",
            minWidth: 260,
            flexDirection: "column",
            gap: 2,
            padding: 6,
            border: "1px solid #cbd5e1",
            borderRadius: 10,
            background: "#ffffff",
            boxShadow: "0 12px 28px rgba(15, 23, 42, 0.16)",
          }}
        >
          {mathModeMenuItems.map((item) => (
            <button
              key={item.label}
              type="button"
              role="menuitem"
              onClick={() => {
                window.dispatchEvent(
                  new CustomEvent(INSERT_SNIPPET_EVENT, {
                    detail: { snippet: item.snippet },
                  }),
                );

                setOpenMenu(null);
                setActiveSubmenu(null);
              }}
              style={{
                display: "block",
                width: "100%",
                border: 0,
                borderRadius: 7,
                padding: "6px 8px",
                background: "transparent",
                color: "#334155",
                fontSize: 12,
                fontWeight: 500,
                textAlign: "left",
                whiteSpace: "nowrap",
              }}
            >
              {item.label}
            </button>
          ))}
        </div>
      ) : null}

      {openMenu === "Math" && activeSubmenu === "分数・根号・添字" ? (
        <div
          role="menu"
          aria-label="分数・根号・添字 menu"
          style={{
            position: "fixed",
            top: submenuPosition.top,
            left: submenuPosition.left,
            zIndex: 2147483647,
            display: "flex",
            minWidth: 230,
            flexDirection: "column",
            gap: 2,
            padding: 6,
            border: "1px solid #cbd5e1",
            borderRadius: 10,
            background: "#ffffff",
            boxShadow: "0 12px 28px rgba(15, 23, 42, 0.16)",
          }}
        >
          {fracRootSubscriptMenuItems.map((item) => (
            <button
              key={item.label}
              type="button"
              role="menuitem"
              onClick={() => {
                window.dispatchEvent(
                  new CustomEvent(INSERT_SNIPPET_EVENT, {
                    detail: { snippet: item.snippet },
                  }),
                );

                setOpenMenu(null);
                setActiveSubmenu(null);
              }}
              style={{
                display: "block",
                width: "100%",
                border: 0,
                borderRadius: 7,
                padding: "6px 8px",
                background: "transparent",
                color: "#334155",
                fontSize: 12,
                fontWeight: 500,
                textAlign: "left",
                whiteSpace: "nowrap",
              }}
            >
              {item.label}
            </button>
          ))}
        </div>
      ) : null}
      {openMenu === "Math" && activeSubmenu === "ギリシャ文字" ? (
        <div
          role="menu"
          aria-label="ギリシャ文字 menu"
          style={{
            position: "fixed",
            top: submenuPosition.top,
            left: submenuPosition.left,
            zIndex: 2147483647,
            display: "grid",
            gridTemplateColumns: "repeat(3, minmax(110px, 1fr))",
            gap: 2,
            minWidth: 360,
            maxHeight: "min(70vh, 520px)",
            overflowY: "auto",
            padding: 6,
            border: "1px solid #cbd5e1",
            borderRadius: 10,
            background: "#ffffff",
            boxShadow: "0 12px 28px rgba(15, 23, 42, 0.16)",
          }}
        >
          {greekMenuItems.map((item) => (
            <button
              key={item.label}
              type="button"
              role="menuitem"
              onClick={() => {
                window.dispatchEvent(
                  new CustomEvent(INSERT_SNIPPET_EVENT, {
                    detail: { snippet: item.snippet },
                  }),
                );

                setOpenMenu(null);
                setActiveSubmenu(null);
              }}
              style={{
                display: "block",
                width: "100%",
                border: 0,
                borderRadius: 7,
                padding: "6px 8px",
                background: "transparent",
                color: "#334155",
                fontSize: 12,
                fontWeight: 500,
                textAlign: "left",
                whiteSpace: "nowrap",
              }}
            >
              {item.label}
            </button>
          ))}
        </div>
      ) : null}

      {openMenu === "Math" && activeSubmenu === "数学関数" ? (
        <div
          role="menu"
          aria-label="数学関数 menu"
          style={{
            position: "fixed",
            top: submenuPosition.top,
            left: submenuPosition.left,
            zIndex: 2147483647,
            display: "grid",
            gridTemplateColumns: "repeat(4, minmax(120px, 1fr))",
            gap: 2,
            minWidth: 520,
            maxHeight: "min(70vh, 520px)",
            overflowY: "auto",
            padding: 6,
            border: "1px solid #cbd5e1",
            borderRadius: 10,
            background: "#ffffff",
            boxShadow: "0 12px 28px rgba(15, 23, 42, 0.16)",
          }}
        >
          {mathFunctionMenuItems.map((item) => (
            <button
              key={item.label}
              type="button"
              role="menuitem"
              onClick={() => {
                window.dispatchEvent(
                  new CustomEvent(INSERT_SNIPPET_EVENT, {
                    detail: { snippet: item.snippet },
                  }),
                );

                setOpenMenu(null);
                setActiveSubmenu(null);
              }}
              style={{
                display: "block",
                width: "100%",
                border: 0,
                borderRadius: 7,
                padding: "6px 8px",
                background: "transparent",
                color: "#334155",
                fontSize: 12,
                fontWeight: 500,
                textAlign: "left",
                whiteSpace: "nowrap",
              }}
            >
              {item.label}
            </button>
          ))}
        </div>
      ) : null}

      {openMenu === "Math" && activeSubmenu === "和・積分記号等" ? (
        <div
          role="menu"
          aria-label="和・積分記号等 menu"
          style={{
            position: "fixed",
            top: submenuPosition.top,
            left: submenuPosition.left,
            zIndex: 2147483647,
            display: "grid",
            gridTemplateColumns: "repeat(3, minmax(120px, 1fr))",
            gap: 2,
            minWidth: 390,
            padding: 6,
            border: "1px solid #cbd5e1",
            borderRadius: 10,
            background: "#ffffff",
            boxShadow: "0 12px 28px rgba(15, 23, 42, 0.16)",
          }}
        >
          {sumIntegralMenuItems.map((item) => (
            <button
              key={item.label}
              type="button"
              role="menuitem"
              onClick={() => {
                window.dispatchEvent(
                  new CustomEvent(INSERT_SNIPPET_EVENT, {
                    detail: { snippet: item.snippet },
                  }),
                );

                setOpenMenu(null);
                setActiveSubmenu(null);
              }}
              style={{
                display: "block",
                width: "100%",
                border: 0,
                borderRadius: 7,
                padding: "6px 8px",
                background: "transparent",
                color: "#334155",
                fontSize: 12,
                fontWeight: 500,
                textAlign: "left",
                whiteSpace: "nowrap",
              }}
            >
              {item.label}
            </button>
          ))}
        </div>
      ) : null}

      {openMenu === "Math" && activeSubmenu === "cases / matrix" ? (
        <div
          role="menu"
          aria-label="cases / matrix menu"
          style={{
            position: "fixed",
            top: submenuPosition.top,
            left: submenuPosition.left,
            zIndex: 2147483647,
            display: "grid",
            gridTemplateColumns: "repeat(2, minmax(140px, 1fr))",
            gap: 2,
            minWidth: 300,
            padding: 6,
            border: "1px solid #cbd5e1",
            borderRadius: 10,
            background: "#ffffff",
            boxShadow: "0 12px 28px rgba(15, 23, 42, 0.16)",
          }}
        >
          {casesMatrixMenuItems.map((item) => (
            <button
              key={item.label}
              type="button"
              role="menuitem"
              onClick={() => {
                window.dispatchEvent(
                  new CustomEvent(INSERT_SNIPPET_EVENT, {
                    detail: { snippet: item.snippet },
                  }),
                );

                setOpenMenu(null);
                setActiveSubmenu(null);
              }}
              style={{
                display: "block",
                width: "100%",
                border: 0,
                borderRadius: 7,
                padding: "6px 8px",
                background: "transparent",
                color: "#334155",
                fontSize: 12,
                fontWeight: 500,
                textAlign: "left",
                whiteSpace: "nowrap",
              }}
            >
              {item.label}
            </button>
          ))}
        </div>
      ) : null}

      {openMenu === "TeX Insert" && activeSubmenu === "figure / table" ? (
        <div
          role="menu"
          aria-label="figure / table menu"
          style={{
            position: "fixed",
            top: submenuPosition.top,
            left: submenuPosition.left,
            zIndex: 2147483647,
            display: "grid",
            gridTemplateColumns: "repeat(2, minmax(170px, 1fr))",
            gap: 2,
            minWidth: 370,
            padding: 6,
            border: "1px solid #cbd5e1",
            borderRadius: 10,
            background: "#ffffff",
            boxShadow: "0 12px 28px rgba(15, 23, 42, 0.16)",
          }}
        >
          {figureTableMenuItems.map((item) => (
            <button
              key={item.label}
              type="button"
              role="menuitem"
              onClick={() => {
                window.dispatchEvent(
                  new CustomEvent(INSERT_SNIPPET_EVENT, {
                    detail: { snippet: item.snippet },
                  }),
                );

                setOpenMenu(null);
                setActiveSubmenu(null);
              }}
              style={{
                display: "block",
                width: "100%",
                border: 0,
                borderRadius: 7,
                padding: "6px 8px",
                background: "transparent",
                color: "#334155",
                fontSize: 12,
                fontWeight: 500,
                textAlign: "left",
                whiteSpace: "nowrap",
              }}
            >
              {item.label}
            </button>
          ))}
        </div>
      ) : null}

      {openMenu === "TeX Insert" && activeSubmenu === "theorem / proof" ? (
        <div
          role="menu"
          aria-label="theorem / proof menu"
          style={{
            position: "fixed",
            top: submenuPosition.top,
            left: submenuPosition.left,
            zIndex: 2147483647,
            display: "grid",
            gridTemplateColumns: "repeat(2, minmax(180px, 1fr))",
            gap: 2,
            minWidth: 390,
            maxHeight: "min(70vh, 520px)",
            overflowY: "auto",
            padding: 6,
            border: "1px solid #cbd5e1",
            borderRadius: 10,
            background: "#ffffff",
            boxShadow: "0 12px 28px rgba(15, 23, 42, 0.16)",
          }}
        >
          {theoremProofMenuItems.map((item) => (
            <button
              key={item.label}
              type="button"
              role="menuitem"
              onClick={() => {
                window.dispatchEvent(
                  new CustomEvent(INSERT_SNIPPET_EVENT, {
                    detail: { snippet: item.snippet },
                  }),
                );

                setOpenMenu(null);
                setActiveSubmenu(null);
              }}
              style={{
                display: "block",
                width: "100%",
                border: 0,
                borderRadius: 7,
                padding: "6px 8px",
                background: "transparent",
                color: "#334155",
                fontSize: 12,
                fontWeight: 500,
                textAlign: "left",
                whiteSpace: "nowrap",
              }}
            >
              {item.label}
            </button>
          ))}
        </div>
      ) : null}

      {openMenu === "TeX Insert" && activeSubmenu === "日本語 TeX preamble" ? (
        <div
          role="menu"
          aria-label="日本語 TeX preamble menu"
          style={{
            position: "fixed",
            top: submenuPosition.top,
            left: submenuPosition.left,
            zIndex: 2147483647,
            display: "grid",
            gridTemplateColumns: "repeat(1, minmax(240px, 1fr))",
            gap: 2,
            minWidth: 280,
            padding: 6,
            border: "1px solid #cbd5e1",
            borderRadius: 10,
            background: "#ffffff",
            boxShadow: "0 12px 28px rgba(15, 23, 42, 0.16)",
          }}
        >
          {japanesePreambleMenuItems.map((item) => (
            <button
              key={item.label}
              type="button"
              role="menuitem"
              onClick={() => {
                window.dispatchEvent(
                  new CustomEvent(INSERT_SNIPPET_EVENT, {
                    detail: { snippet: item.snippet },
                  }),
                );

                setOpenMenu(null);
                setActiveSubmenu(null);
              }}
              style={{
                display: "block",
                width: "100%",
                border: 0,
                borderRadius: 7,
                padding: "6px 8px",
                background: "transparent",
                color: "#334155",
                fontSize: 12,
                fontWeight: 500,
                textAlign: "left",
                whiteSpace: "nowrap",
              }}
            >
              {item.label}
            </button>
          ))}
        </div>
      ) : null}

      {openMenu === "Math" && activeSubmenu === "数学記号" ? (
        <div
          role="menu"
          aria-label="数学記号 menu"
          style={{
            position: "fixed",
            top: submenuPosition.top,
            left: submenuPosition.left,
            zIndex: 2147483647,
            display: "grid",
            gridTemplateColumns: "repeat(4, minmax(120px, 1fr))",
            gap: 2,
            minWidth: 520,
            maxHeight: "min(70vh, 520px)",
            overflowY: "auto",
            padding: 6,
            border: "1px solid #cbd5e1",
            borderRadius: 10,
            background: "#ffffff",
            boxShadow: "0 12px 28px rgba(15, 23, 42, 0.16)",
          }}
        >
          {mathSymbolMenuItems.map((item) => (
            <button
              key={item.label}
              type="button"
              role="menuitem"
              onClick={() => {
                window.dispatchEvent(
                  new CustomEvent(INSERT_SNIPPET_EVENT, {
                    detail: { snippet: item.snippet },
                  }),
                );

                setOpenMenu(null);
                setActiveSubmenu(null);
              }}
              style={{
                display: "block",
                width: "100%",
                border: 0,
                borderRadius: 7,
                padding: "6px 8px",
                background: "transparent",
                color: "#334155",
                fontSize: 12,
                fontWeight: 500,
                textAlign: "left",
                whiteSpace: "nowrap",
              }}
            >
              {item.label}
            </button>
          ))}
        </div>
      ) : null}

      {openMenu === "Math" && activeSubmenu === "矢印" ? (
        <div
          role="menu"
          aria-label="矢印 menu"
          style={{
            position: "fixed",
            top: submenuPosition.top,
            left: submenuPosition.left,
            zIndex: 2147483647,
            display: "grid",
            gridTemplateColumns: "repeat(3, minmax(150px, 1fr))",
            gap: 2,
            minWidth: 500,
            maxHeight: "min(70vh, 520px)",
            overflowY: "auto",
            padding: 6,
            border: "1px solid #cbd5e1",
            borderRadius: 10,
            background: "#ffffff",
            boxShadow: "0 12px 28px rgba(15, 23, 42, 0.16)",
          }}
        >
          {arrowMenuItems.map((item) => (
            <button
              key={item.label}
              type="button"
              role="menuitem"
              onClick={() => {
                window.dispatchEvent(
                  new CustomEvent(INSERT_SNIPPET_EVENT, {
                    detail: { snippet: item.snippet },
                  }),
                );

                setOpenMenu(null);
                setActiveSubmenu(null);
              }}
              style={{
                display: "block",
                width: "100%",
                border: 0,
                borderRadius: 7,
                padding: "6px 8px",
                background: "transparent",
                color: "#334155",
                fontSize: 12,
                fontWeight: 500,
                textAlign: "left",
                whiteSpace: "nowrap",
              }}
            >
              {item.label}
            </button>
          ))}
        </div>
      ) : null}

      {openMenu === "Math" && activeSubmenu === "演算子" ? (
        <div
          role="menu"
          aria-label="演算子 menu"
          style={{
            position: "fixed",
            top: submenuPosition.top,
            left: submenuPosition.left,
            zIndex: 2147483647,
            display: "grid",
            gridTemplateColumns: "repeat(6, minmax(105px, 1fr))",
            gap: 2,
            minWidth: 650,
            maxHeight: "min(70vh, 520px)",
            overflowY: "auto",
            padding: 6,
            border: "1px solid #cbd5e1",
            borderRadius: 10,
            background: "#ffffff",
            boxShadow: "0 12px 28px rgba(15, 23, 42, 0.16)",
          }}
        >
          {operatorMenuItems.map((item) => (
            <button
              key={item.label}
              type="button"
              role="menuitem"
              onClick={() => {
                window.dispatchEvent(
                  new CustomEvent(INSERT_SNIPPET_EVENT, {
                    detail: { snippet: item.snippet },
                  }),
                );

                setOpenMenu(null);
                setActiveSubmenu(null);
              }}
              style={{
                display: "block",
                width: "100%",
                border: 0,
                borderRadius: 7,
                padding: "6px 8px",
                background: "transparent",
                color: "#334155",
                fontSize: 12,
                fontWeight: 500,
                textAlign: "left",
                whiteSpace: "nowrap",
              }}
            >
              {item.label}
            </button>
          ))}
        </div>
      ) : null}

      {openMenu === "Math" && activeSubmenu === "関係子" ? (
        <div
          role="menu"
          aria-label="関係子 menu"
          style={{
            position: "fixed",
            top: submenuPosition.top,
            left: submenuPosition.left,
            zIndex: 2147483647,
            display: "grid",
            gridTemplateColumns: "repeat(6, minmax(105px, 1fr))",
            gap: 2,
            minWidth: 650,
            maxHeight: "min(70vh, 520px)",
            overflowY: "auto",
            padding: 6,
            border: "1px solid #cbd5e1",
            borderRadius: 10,
            background: "#ffffff",
            boxShadow: "0 12px 28px rgba(15, 23, 42, 0.16)",
          }}
        >
          {relationMenuItems.map((item) => (
            <button
              key={item.label}
              type="button"
              role="menuitem"
              onClick={() => {
                window.dispatchEvent(
                  new CustomEvent(INSERT_SNIPPET_EVENT, {
                    detail: { snippet: item.snippet },
                  }),
                );

                setOpenMenu(null);
                setActiveSubmenu(null);
              }}
              style={{
                display: "block",
                width: "100%",
                border: 0,
                borderRadius: 7,
                padding: "6px 8px",
                background: "transparent",
                color: "#334155",
                fontSize: 12,
                fontWeight: 500,
                textAlign: "left",
                whiteSpace: "nowrap",
              }}
            >
              {item.label}
            </button>
          ))}
        </div>
      ) : null}

      {openMenu === "Math" && activeSubmenu === "括弧・区切り" ? (
        <div
          role="menu"
          aria-label="括弧・区切り menu"
          style={{
            position: "fixed",
            top: submenuPosition.top,
            left: submenuPosition.left,
            zIndex: 2147483647,
            display: "grid",
            gridTemplateColumns: "repeat(2, minmax(180px, 1fr))",
            gap: 2,
            minWidth: 400,
            maxHeight: "min(70vh, 520px)",
            overflowY: "auto",
            padding: 6,
            border: "1px solid #cbd5e1",
            borderRadius: 10,
            background: "#ffffff",
            boxShadow: "0 12px 28px rgba(15, 23, 42, 0.16)",
          }}
        >
          {delimiterMenuItems.map((item) => (
            <button
              key={item.label}
              type="button"
              role="menuitem"
              onClick={() => {
                window.dispatchEvent(
                  new CustomEvent(INSERT_SNIPPET_EVENT, {
                    detail: { snippet: item.snippet },
                  }),
                );

                setOpenMenu(null);
                setActiveSubmenu(null);
              }}
              style={{
                display: "block",
                width: "100%",
                border: 0,
                borderRadius: 7,
                padding: "6px 8px",
                background: "transparent",
                color: "#334155",
                fontSize: 12,
                fontWeight: 500,
                textAlign: "left",
                whiteSpace: "nowrap",
              }}
            >
              {item.label}
            </button>
          ))}
        </div>
      ) : null}

      {openMenu === "Math" && activeSubmenu === "アクセント・装飾" ? (
        <div
          role="menu"
          aria-label="アクセント・装飾 menu"
          style={{
            position: "fixed",
            top: submenuPosition.top,
            left: submenuPosition.left,
            zIndex: 2147483647,
            display: "grid",
            gridTemplateColumns: "repeat(2, minmax(180px, 1fr))",
            gap: 2,
            minWidth: 400,
            maxHeight: "min(70vh, 520px)",
            overflowY: "auto",
            padding: 6,
            border: "1px solid #cbd5e1",
            borderRadius: 10,
            background: "#ffffff",
            boxShadow: "0 12px 28px rgba(15, 23, 42, 0.16)",
          }}
        >
          {accentMenuItems.map((item) => (
            <button
              key={item.label}
              type="button"
              role="menuitem"
              onClick={() => {
                window.dispatchEvent(
                  new CustomEvent(INSERT_SNIPPET_EVENT, {
                    detail: { snippet: item.snippet },
                  }),
                );

                setOpenMenu(null);
                setActiveSubmenu(null);
              }}
              style={{
                display: "block",
                width: "100%",
                border: 0,
                borderRadius: 7,
                padding: "6px 8px",
                background: "transparent",
                color: "#334155",
                fontSize: 12,
                fontWeight: 500,
                textAlign: "left",
                whiteSpace: "nowrap",
              }}
            >
              {item.label}
            </button>
          ))}
        </div>
      ) : null}

      {openMenu === "TeX Insert" && activeSubmenu === "見出し" ? (
        <div
          role="menu"
          aria-label="見出し menu"
          style={{
            position: "fixed",
            top: submenuPosition.top,
            left: submenuPosition.left,
            zIndex: 2147483647,
            display: "grid",
            gridTemplateColumns: "repeat(2, minmax(150px, 1fr))",
            gap: 2,
            minWidth: 330,
            padding: 6,
            border: "1px solid #cbd5e1",
            borderRadius: 10,
            background: "#ffffff",
            boxShadow: "0 12px 28px rgba(15, 23, 42, 0.16)",
          }}
        >
          {headingMenuItems.map((item) => (
            <button
              key={item.label}
              type="button"
              role="menuitem"
              onClick={() => {
                window.dispatchEvent(
                  new CustomEvent(INSERT_SNIPPET_EVENT, {
                    detail: { snippet: item.snippet },
                  }),
                );

                setOpenMenu(null);
                setActiveSubmenu(null);
              }}
              style={{
                display: "block",
                width: "100%",
                border: 0,
                borderRadius: 7,
                padding: "6px 8px",
                background: "transparent",
                color: "#334155",
                fontSize: 12,
                fontWeight: 500,
                textAlign: "left",
                whiteSpace: "nowrap",
              }}
            >
              {item.label}
            </button>
          ))}
        </div>
      ) : null}

      {openMenu === "TeX Insert" && activeSubmenu === "箇条書き" ? (
        <div
          role="menu"
          aria-label="箇条書き menu"
          style={{
            position: "fixed",
            top: submenuPosition.top,
            left: submenuPosition.left,
            zIndex: 2147483647,
            display: "grid",
            gridTemplateColumns: "repeat(2, minmax(170px, 1fr))",
            gap: 2,
            minWidth: 380,
            padding: 6,
            border: "1px solid #cbd5e1",
            borderRadius: 10,
            background: "#ffffff",
            boxShadow: "0 12px 28px rgba(15, 23, 42, 0.16)",
          }}
        >
          {listMenuItems.map((item) => (
            <button
              key={item.label}
              type="button"
              role="menuitem"
              onClick={() => {
                window.dispatchEvent(
                  new CustomEvent(INSERT_SNIPPET_EVENT, {
                    detail: { snippet: item.snippet },
                  }),
                );

                setOpenMenu(null);
                setActiveSubmenu(null);
              }}
              style={{
                display: "block",
                width: "100%",
                border: 0,
                borderRadius: 7,
                padding: "6px 8px",
                background: "transparent",
                color: "#334155",
                fontSize: 12,
                fontWeight: 500,
                textAlign: "left",
                whiteSpace: "nowrap",
              }}
            >
              {item.label}
            </button>
          ))}
        </div>
      ) : null}

      {openMenu === "TeX Insert" && activeSubmenu === "参照・引用" ? (
        <div
          role="menu"
          aria-label="参照・引用 menu"
          style={{
            position: "fixed",
            top: submenuPosition.top,
            left: submenuPosition.left,
            zIndex: 2147483647,
            display: "grid",
            gridTemplateColumns: "repeat(2, minmax(170px, 1fr))",
            gap: 2,
            minWidth: 380,
            padding: 6,
            border: "1px solid #cbd5e1",
            borderRadius: 10,
            background: "#ffffff",
            boxShadow: "0 12px 28px rgba(15, 23, 42, 0.16)",
          }}
        >
          {referenceMenuItems.map((item) => (
            <button
              key={item.label}
              type="button"
              role="menuitem"
              onClick={() => {
                window.dispatchEvent(
                  new CustomEvent(INSERT_SNIPPET_EVENT, {
                    detail: { snippet: item.snippet },
                  }),
                );

                setOpenMenu(null);
                setActiveSubmenu(null);
              }}
              style={{
                display: "block",
                width: "100%",
                border: 0,
                borderRadius: 7,
                padding: "6px 8px",
                background: "transparent",
                color: "#334155",
                fontSize: 12,
                fontWeight: 500,
                textAlign: "left",
                whiteSpace: "nowrap",
              }}
            >
              {item.label}
            </button>
          ))}
        </div>
      ) : null}

      {openMenu === "TeX Insert" && activeSubmenu === "文書構造" ? (
        <div
          role="menu"
          aria-label="文書構造 menu"
          style={{
            position: "fixed",
            top: submenuPosition.top,
            left: submenuPosition.left,
            zIndex: 2147483647,
            display: "grid",
            gridTemplateColumns: "repeat(2, minmax(170px, 1fr))",
            gap: 2,
            minWidth: 380,
            padding: 6,
            border: "1px solid #cbd5e1",
            borderRadius: 10,
            background: "#ffffff",
            boxShadow: "0 12px 28px rgba(15, 23, 42, 0.16)",
          }}
        >
          {documentStructureMenuItems.map((item) => (
            <button
              key={item.label}
              type="button"
              role="menuitem"
              onClick={() => {
                window.dispatchEvent(
                  new CustomEvent(INSERT_SNIPPET_EVENT, {
                    detail: { snippet: item.snippet },
                  }),
                );

                setOpenMenu(null);
                setActiveSubmenu(null);
              }}
              style={{
                display: "block",
                width: "100%",
                border: 0,
                borderRadius: 7,
                padding: "6px 8px",
                background: "transparent",
                color: "#334155",
                fontSize: 12,
                fontWeight: 500,
                textAlign: "left",
                whiteSpace: "nowrap",
              }}
            >
              {item.label}
            </button>
          ))}
        </div>
      ) : null}

      {openMenu === "TeX Insert" && activeSubmenu === "配置・引用環境" ? (
        <div
          role="menu"
          aria-label="配置・引用環境 menu"
          style={{
            position: "fixed",
            top: submenuPosition.top,
            left: submenuPosition.left,
            zIndex: 2147483647,
            display: "grid",
            gridTemplateColumns: "repeat(2, minmax(180px, 1fr))",
            gap: 2,
            minWidth: 410,
            maxHeight: "min(70vh, 520px)",
            overflowY: "auto",
            padding: 6,
            border: "1px solid #cbd5e1",
            borderRadius: 10,
            background: "#ffffff",
            boxShadow: "0 12px 28px rgba(15, 23, 42, 0.16)",
          }}
        >
          {placementQuoteMenuItems.map((item) => (
            <button
              key={item.label}
              type="button"
              role="menuitem"
              onClick={() => {
                window.dispatchEvent(
                  new CustomEvent(INSERT_SNIPPET_EVENT, {
                    detail: { snippet: item.snippet },
                  }),
                );

                setOpenMenu(null);
                setActiveSubmenu(null);
              }}
              style={{
                display: "block",
                width: "100%",
                border: 0,
                borderRadius: 7,
                padding: "6px 8px",
                background: "transparent",
                color: "#334155",
                fontSize: 12,
                fontWeight: 500,
                textAlign: "left",
                whiteSpace: "nowrap",
              }}
            >
              {item.label}
            </button>
          ))}
        </div>
      ) : null}

      {openMenu === "TeX Insert" && activeSubmenu === "そのまま出力" ? (
        <div
          role="menu"
          aria-label="そのまま出力 menu"
          style={{
            position: "fixed",
            top: submenuPosition.top,
            left: submenuPosition.left,
            zIndex: 2147483647,
            display: "grid",
            gridTemplateColumns: "repeat(1, minmax(220px, 1fr))",
            gap: 2,
            minWidth: 260,
            padding: 6,
            border: "1px solid #cbd5e1",
            borderRadius: 10,
            background: "#ffffff",
            boxShadow: "0 12px 28px rgba(15, 23, 42, 0.16)",
          }}
        >
          {rawOutputMenuItems.map((item) => (
            <button
              key={item.label}
              type="button"
              role="menuitem"
              onClick={() => {
                window.dispatchEvent(
                  new CustomEvent(INSERT_SNIPPET_EVENT, {
                    detail: { snippet: item.snippet },
                  }),
                );

                setOpenMenu(null);
                setActiveSubmenu(null);
              }}
              style={{
                display: "block",
                width: "100%",
                border: 0,
                borderRadius: 7,
                padding: "6px 8px",
                background: "transparent",
                color: "#334155",
                fontSize: 12,
                fontWeight: 500,
                textAlign: "left",
                whiteSpace: "nowrap",
              }}
            >
              {item.label}
            </button>
          ))}
        </div>
      ) : null}

    </nav>
  );
}
