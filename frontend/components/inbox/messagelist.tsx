import MessageCard from "./messagecard";

export default function MessageList() {
  return (
    <div className="space-y-3">

      <MessageCard
        name="John Smith"
        subject="Dashboard Design Review"
        time="2m"
      />

      <MessageCard
        name="Sarah Wilson"
        subject="Project Requirements Updated"
        time="15m"
      />

      <MessageCard
        name="Project Team"
        subject="Sprint Planning Meeting"
        time="30m"
      />

      <MessageCard
        name="Admin"
        subject="Monthly Report Ready"
        time="1h"
      />

    </div>
  );
}