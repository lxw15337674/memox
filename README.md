# **✍️ Memox** 
**A modern and elegant note-taking application**

## 🌟 Features

- **📝 Quick Notes**: Fast and efficient note-taking interface
- **🔍 Multi-filter Search**: Advanced filtering capabilities for easy memo retrieval
- **📊 Multi-dimensional Statistics**: Comprehensive data analysis and visualization
- **🎨 Share Cards Generation**: Create and share beautiful memo cards
- **📱 Responsive Design**: Works seamlessly across desktop and mobile devices
- **🔄 Data Import/Export**: Support for XLSX file import/export
- **🎯 AI Integration**: Smart features powered by AI capabilities
- **🌓 Dark Mode**: Support for both light and dark themes

## 🛠️ Tech Stack

- **Framework**: [Next.js 15](https://nextjs.org/) with TypeScript
- **UI Components**: 
  - [Tailwind CSS](https://tailwindcss.com/) for styling
  - [Shadcn/ui](https://ui.shadcn.com/) for UI components
  - [Radix UI](https://www.radix-ui.com/) for accessible components
- **State Management**: 
  - [Zustand](https://zustand-demo.pmnd.rs/) for state management
  - [Immer](https://immerjs.github.io/immer/) for immutable state updates
- **Database**: PostgreSQL with Prisma ORM
- **Utilities**:
  - [Ahooks](https://ahooks.js.org/) for React hooks
  - [date-fns](https://date-fns.org/) for date manipulation
  - [XLSX](https://sheetjs.com/) for spreadsheet processing

## 🚀 Getting Started

### Prerequisites

- Node.js 18+ 
- PNPM package manager
- PostgreSQL database

### Installation

1. **Clone the repository**
```bash
git clone https://github.com/yourusername/memox.git
cd memox
```

2. **Install dependencies**
```bash
pnpm install
```

3. **Configure environment variables**
Create a `.env` file in the root directory with the following variables:
```env
DATABASE_URL="your-postgresql-connection-string"
AI_API_KEY="your-ai-api-key"
AI_BASE_URL="your-ai-base-url"
ACCESS_CODE="your-edit-code"
```

4. **Initialize database**
```bash
pnpm migrate
```

5. **Start development server**
```bash
pnpm dev
```

Visit [http://localhost:3000](http://localhost:3000/) to see your application.

## 🌍 Deployment

### Deploy to Vercel

1. Fork this repository
2. Create a new project in Vercel
3. Configure the environment variables in Vercel project settings
4. Deploy!

## 📝 License

This project is licensed under the MIT License - see the LICENSE file for details.

## 🤝 Contributing

Contributions, issues, and feature requests are welcome! Feel free to check the issues page.

