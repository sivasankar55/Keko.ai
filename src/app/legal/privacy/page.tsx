export default function Privacy() {
  return (
    <div className="min-h-screen px-6 py-16">
      <article className="max-w-2xl mx-auto prose-luxe">
        <h1>Privacy Policy</h1>
        <p>
          keko.ai stores your account, conversations, and uploaded files securely in your Supabase
          project. Data is protected by Row Level Security so only you can access your own data.
        </p>
        <h2>What we collect</h2>
        <ul>
          <li>Email address and (if used) OAuth profile name + avatar.</li>
          <li>Your conversation history and uploaded files.</li>
          <li>Basic technical logs needed to operate the service.</li>
        </ul>
        <h2>Third parties</h2>
        <p>
          We send your message content to Google&rsquo;s Gemini API for processing, and image
          prompts to Pollinations.ai (or HuggingFace if configured) for image generation.
        </p>
        <h2>Your rights</h2>
        <p>You can delete any conversation at any time. To delete your account, contact support.</p>
      </article>
    </div>
  );
}
