<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://github.com/user-attachments/assets/0aa67016-6eaf-458a-adb2-6e31a0763ed6" />
</div>

# OhmicCAD

Simulador eletrônico interativo com solver não linear, visualização em tempo real e interface React.

## Requisitos

- Node.js 20+ (recomendado)
- npm 10+

## Setup local

1. Instale as dependências:

   ```bash
   npm install
   ```

2. Crie o arquivo de ambiente local e configure a chave da API Gemini:

   ```bash
   cp .env.example .env.local
   ```

   Se `.env.example` não existir, crie `.env.local` com:

   ```env
   GEMINI_API_KEY=sua_chave_aqui
   ```

3. Inicie em modo desenvolvimento:

   ```bash
   npm run dev
   ```

4. Acesse `http://localhost:5173`.

## Scripts úteis

- `npm run dev` — sobe a aplicação local.
- `npm run build` — gera build de produção.
- `npm run lint` — valida tipagem TypeScript (`tsc --noEmit`).
- `npm run preview` — serve build local para validação.

## Arquitetura (visão breve)

- **UI (React + Vite):** renderização do editor, painéis de propriedades e interação do usuário (`App.tsx`, `components/*`).
- **Solver (engine canônica):** regras físicas e análise de circuito em `engine/analysis/circuitEngine.ts`, incluindo MNA, dispositivos lineares/não lineares e iteração de Newton.
- **Dados e adaptação:** `services/Solver.ts` converte modelos da UI (`ComponentModel`/`WireModel`) para o formato da engine e reconcilia resultados no estado de simulação; dados estáticos de apoio ficam em `data/*`.

## Contribuição

Fluxo sugerido:

1. Abra uma issue descrevendo bug, melhoria ou funcionalidade.
2. Crie uma branch com escopo pequeno e focado.
3. Envie um PR referenciando a issue.
4. Ajuste o PR conforme revisão.

### Checklist de Pull Request

- [ ] `npm run build` executa sem erros.
- [ ] `npm run lint` executa sem erros.
- [ ] Documentação atualizada (README, comentários e/ou instruções técnicas).
- [ ] Mudanças em UI/fluxo foram verificadas manualmente.
- [ ] Novas decisões técnicas foram registradas de forma clara no PR.

## Licença

Este projeto atualmente **não possui uma licença open source publicada**.
Na ausência de um arquivo `LICENSE`, todos os direitos são reservados ao autor.

## Autor e contato

- **Autor:** Pedro Kutski
- **Contato:** pedrokutski@outlook.com
