import ChatPanel from './components/ChatPanel'
import Map3DView from './components/Map3DView'
import './styles/layout.css'

function App() {
  return (
    <main className="appShell">
      <section className="mapPane">
        <Map3DView />
      </section>
      <aside className="chatPane">
        <ChatPanel />
      </aside>
    </main>
  )
}

export default App
