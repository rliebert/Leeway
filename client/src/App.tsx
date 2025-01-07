import { Switch, Route } from "wouter";
import { WSProvider } from "@/lib/ws";
import Home from "@/pages/Home";

function App() {
  return (
    <WSProvider>
      <Switch>
        <Route path="/" component={Home} />
      </Switch>
    </WSProvider>
  );
}

export default App;
