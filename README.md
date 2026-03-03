# OhmicCAD

O **OhmicCAD** é um simulador de circuitos eletrônicos interativo e de alta performance, desenvolvido com **React** e **TypeScript**. O projeto foca em fornecer uma experiência de simulação em tempo real diretamente no navegador, utilizando métodos numéricos avançados para resolver redes lineares e não lineares.

> 🚧 **Status do Projeto:** Em desenvolvimento ativo (Work in Progress). Funcionalidades de solver e interface básica já operacionais.

---

## 🚀 Funcionalidades Principais

* **Solver Não Linear:** Motor de simulação baseado em **MNA (Modified Nodal Analysis)**.
* **Iteração de Newton-Raphson:** Suporte para componentes não lineares (diodos, transistores) com convergência iterativa.
* **Visualização em Tempo Real:** Renderização dinâmica de tensões e correntes conforme o circuito é modificado no canvas.
* **Interface Reativa:** Editor intuitivo construído com React, permitindo a manipulação fluida de componentes (`ComponentModel`) e conexões (`WireModel`).

---

## 🏗️ Arquitetura do Sistema

O projeto é estruturado em três camadas principais para garantir a separação de responsabilidades:

1.  **UI Layer (React + Vite):** Gerencia o canvas do editor, painéis de propriedades e o estado da interface. Localizado em `src/components`.
2.  **Abstraction Layer (Services):** O arquivo `services/Solver.ts` atua como uma ponte, convertendo os modelos da interface para o formato matemático processável pela engine.
3.  **Core Engine (Physics):** O coração do projeto em `engine/analysis/circuitEngine.ts`. Implementa as leis de Kirchhoff e os algoritmos de resolução de sistemas lineares.

---

## 🛠️ Tecnologias Utilizadas

* **Frontend:** [React.js](https://reactjs.org/)
* **Linguagem:** [TypeScript](https://www.typescriptlang.org/) (Tipagem estrita para segurança no solver)
* **Build Tool:** [Vite](https://vitejs.dev/)
* **IA Integration:** Google Gemini API (para auxílio em análise e sugestões de circuitos)

---

## 💻 Configuração Local

### Pré-requisitos
* **Node.js:** v20 ou superior
* **npm:** v10 ou superior

### Instalação

1.  **Clone o repositório e instale as dependências:**
    ```bash
    npm install
    ```

2.  **Configure as variáveis de ambiente:**
    Crie um arquivo `.env.local` na raiz do projeto:
    ```env
    GEMINI_API_KEY=sua_chave_aqui
    ```

3.  **Inicie o servidor de desenvolvimento:**
    ```bash
    npm run dev
    ```
    Acesse: `http://localhost:5173`

---

## 📉 Roadmap de Desenvolvimento

- [x] Implementação do Solver MNA básico.
- [x] Interface de edição (Drag & Drop).
- [ ] Implementação de análise transiente (Time-stepping).
- [ ] Expansão da biblioteca de componentes (MOSFETs, OpAmps).
- [ ] Exportação de esquemáticos em formato JSON/Netlist.

---

## 📄 Licença e Contato

**Licença:** Atualmente, todos os direitos são reservados ao autor.

**Desenvolvedor:** Pedro Kutski  
**Email:** [pedrokutski@outlook.com](mailto:pedrokutski@outlook.com)
