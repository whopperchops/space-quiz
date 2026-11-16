const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const { join } = require("node:path");
const { test } = require("node:test");
const vm = require("node:vm");

const html = readFileSync(join(__dirname, "..", "index.html"), "utf8");
const script = html.match(/<script>([\s\S]*?)<\/script>/)[1];

class Element {
  constructor() {
    this.children = [];
    this.listeners = {};
    this.attributes = {};
    this.style = {};
    this.classList = {
      add: (name) => {
        this.className = `${this.className || ""} ${name}`.trim();
      }
    };
  }

  addEventListener(event, callback) {
    this.listeners[event] = callback;
  }

  append(...children) {
    this.children.push(...children);
  }

  replaceChildren(...children) {
    this.children = children;
  }

  setAttribute(name, value) {
    this.attributes[name] = value;
  }

  focus() {}

  click() {
    if (!this.disabled) this.listeners.click?.();
  }

  get firstElementChild() {
    return this.children[0];
  }
}

function createQuiz(storage) {
  const ids = [
    "question-count", "score", "category", "question", "feedback", "next",
    "answers", "quiz", "results", "reaction", "result-title", "result-message",
    "final-score", "best-score", "accuracy", "restart"
  ];
  const elements = Object.fromEntries(ids.map((id) => [id, new Element()]));
  elements.next.append(new Element());
  elements.restart.append(new Element());
  const selectors = {
    ".fill": new Element(),
    ".track": new Element(),
    ".hint": new Element()
  };
  const document = {
    getElementById: (id) => elements[id],
    querySelector: (selector) => selectors[selector],
    createElement: () => new Element()
  };
  const context = vm.createContext({ document, localStorage: storage });
  vm.runInContext(script, context);
  return {
    elements,
    questions: vm.runInContext("questions", context)
  };
}

function completeAttempt(quiz, correctAnswers, startIndex = 0) {
  quiz.questions.slice(startIndex).forEach((question, offset) => {
    const index = startIndex + offset;
    const choice = index < correctAnswers ? question.correct : (question.correct + 1) % question.answers.length;
    quiz.elements.answers.children[choice].click();
    quiz.elements.next.click();
  });
}

test("stores the best completed score and keeps it across attempts and reloads", () => {
  const values = new Map();
  const storage = {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value)
  };
  const quiz = createQuiz(storage);

  quiz.elements.answers.children[quiz.questions[0].correct].click();
  assert.equal(values.has("orbital-best-score"), false);
  quiz.elements.next.click();
  completeAttempt(quiz, 8, 1);
  assert.equal(values.get("orbital-best-score"), "8");
  assert.equal(quiz.elements["best-score"].textContent, "Best completed score: 8 / 10");

  quiz.elements.restart.click();
  quiz.elements.answers.children[quiz.questions[0].correct].click();
  assert.equal(values.get("orbital-best-score"), "8");
  completeAttempt(quiz, 5, 1);
  assert.equal(values.get("orbital-best-score"), "8");

  const reloadedQuiz = createQuiz(storage);
  completeAttempt(reloadedQuiz, 10);
  assert.equal(values.get("orbital-best-score"), "10");
});

test("explains when local storage cannot be read", () => {
  const quiz = createQuiz({
    getItem() {
      throw new Error("storage unavailable");
    },
    setItem() {
      throw new Error("storage unavailable");
    }
  });

  completeAttempt(quiz, 6);
  assert.equal(quiz.elements["best-score"].textContent, "Best score couldn't be saved on this device.");
});

test("explains when local storage cannot be written", () => {
  const quiz = createQuiz({
    getItem: () => null,
    setItem() {
      throw new Error("storage unavailable");
    }
  });

  completeAttempt(quiz, 6);
  assert.equal(quiz.elements["best-score"].textContent, "Best score couldn't be saved on this device.");
});
